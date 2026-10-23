import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as nodemailer from 'nodemailer';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west1' });

const SUB_PRICE = 200;
const SUB_DAYS = 30;

export const createSubscriptionPayment = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Войдите');
  const uid = request.auth.uid;
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists || snap.data()?.role !== 'master') {
    throw new HttpsError('permission-denied', 'Только для мастеров');
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) {
    const expires = Timestamp.fromMillis(Date.now() + SUB_DAYS * 86400000);
    await userRef.update({ subscriptionStatus: 'active', subscriptionExpiresAt: expires });
    return { demo: true, activated: true, amount: SUB_PRICE };
  }

  const returnUrl = process.env.APP_URL || 'https://zapisipro.netlify.app/subscription';
  const authHeader = Buffer.from(`${shopId}:${secret}`).toString('base64');
  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authHeader}`,
      'Idempotence-Key': `${uid}-${Date.now()}`,
    },
    body: JSON.stringify({
      amount: { value: SUB_PRICE.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: 'Подписка Мастер-Календарь 30 дней',
      metadata: { uid, type: 'subscription_monthly' },
    }),
  });
  if (!res.ok) throw new HttpsError('internal', await res.text());
  const payment = (await res.json()) as { id: string; confirmation?: { confirmation_url?: string } };
  await db.collection('payments').doc(payment.id).set({
    uid,
    status: 'pending',
    amount: SUB_PRICE,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { paymentId: payment.id, confirmationUrl: payment.confirmation?.confirmation_url };
});

export const yookassaWebhookHttp = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  const event = req.body as {
    event?: string;
    object?: { id?: string; metadata?: { uid?: string } };
  };
  if (event.event === 'payment.succeeded' && event.object?.metadata?.uid) {
    const uid = event.object.metadata.uid;
    await db.collection('users').doc(uid).update({
      subscriptionStatus: 'active',
      subscriptionExpiresAt: Timestamp.fromMillis(Date.now() + SUB_DAYS * 86400000),
    });
  }
  res.status(200).json({ ok: true });
});

function mailTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.yandex.ru',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  });
}

export const sendAppointmentReminders = onSchedule('every 5 minutes', async () => {
  const now = Timestamp.now();
  const q = await db
    .collection('appointments')
    .where('notified', '==', false)
    .where('notifyAt', '<=', now)
    .limit(50)
    .get();
  if (q.empty) return;
  const messaging = getMessaging();
  const transporter = mailTransport();

  for (const docSnap of q.docs) {
    const apt = docSnap.data();
    const calSnap = await db.collection('calendars').doc(apt.calendarId).get();
    if (!calSnap.exists) {
      await docSnap.ref.update({ notified: true });
      continue;
    }
    const cal = calSnap.data()!;
    const recipientUids = new Set<string>([cal.ownerId, ...(cal.editors || []), ...(cal.viewers || [])]);
    const title = 'Скоро запись';
    const body = `${apt.startTime} · ${apt.service || 'Услуга'} · ${apt.clientName || ''}`.trim();

    for (const uid of recipientUids) {
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data()!;
      if (user.notifyPush !== false) {
        const tokensSnap = await db.collection('fcmTokens').where('uid', '==', uid).get();
        const tokens = tokensSnap.docs.map((d) => d.data().token as string).filter(Boolean);
        if (tokens.length) {
          try {
            await messaging.sendEachForMulticast({
              tokens,
              notification: { title, body },
              data: { appointmentId: docSnap.id },
            });
          } catch (e) {
            console.error('FCM', e);
          }
        }
      }
      if (user.notifyEmail !== false && user.email && transporter) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: title,
            text: `${body}\nДата: ${apt.date}`,
          });
        } catch (e) {
          console.error('Email', e);
        }
      }
    }
    await docSnap.ref.update({ notified: true });
  }
});

export const expireSubscriptions = onSchedule('every 24 hours', async () => {
  const now = Timestamp.now();
  const q = await db
    .collection('users')
    .where('role', '==', 'master')
    .where('subscriptionStatus', 'in', ['trial', 'active'])
    .get();
  const batch = db.batch();
  let n = 0;
  for (const d of q.docs) {
    const exp = d.data().subscriptionExpiresAt as Timestamp | undefined;
    if (exp && exp.toMillis() < now.toMillis()) {
      batch.update(d.ref, { subscriptionStatus: 'expired' });
      n++;
    }
  }
  if (n) await batch.commit();
});
