/**
 * MAX bot webhook — completes external login sessions.
 *
 * When user opens bot with start payload login_<sessionId>, bot:
 * 1) identifies MAX user id
 * 2) creates Firebase user + custom token
 * 3) stores token on maxLoginSessions/{session}
 * 4) replies with a button/link back to the web app
 *
 * Set webhook (after deploy) to:
 *   https://YOUR_SITE.netlify.app/.netlify/functions/max-bot-webhook
 *
 * Env: MAX_BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID, APP_URL
 *
 * MAX Bot API base (per docs): https://platform-api2.max.ru
 * Authorization: <token>
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const API = process.env.MAX_API_BASE || 'https://platform-api2.max.ru';

function ok() {
  return { statusCode: 200, body: 'ok' };
}

function parseSa(raw) {
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa?.project_id) throw new Error('bad sa');
  return sa;
}

function adminFor(sa) {
  const name = `max-hook-${sa.project_id}`;
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp({ credential: cert(sa), projectId: sa.project_id }, name);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function maxApi(path, method, body) {
  const token = process.env.MAX_BOT_TOKEN;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    console.error('MAX API error', res.status, data);
    throw new Error(`MAX API ${res.status}`);
  }
  return data;
}

function extractSession(text) {
  if (!text) return null;
  const m = String(text).match(/login_([a-f0-9]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

function pickUser(update) {
  // Tolerate several possible MAX update shapes
  const msg = update.message || update.update?.message || update;
  const from =
    msg?.from ||
    msg?.sender ||
    msg?.user ||
    update.user ||
    update.from ||
    null;
  const chatId =
    msg?.chat?.id ||
    msg?.recipient?.chat_id ||
    msg?.chat_id ||
    from?.id ||
    update.chat_id;
  const text =
    msg?.text ||
    msg?.body?.text ||
    update.text ||
    update.start_payload ||
    update.payload ||
    '';
  const startPayload =
    update.start_payload ||
    msg?.start_payload ||
    extractSession(text) && `login_${extractSession(text)}` ||
    '';
  return { from, chatId, text, startPayload };
}

async function completeLogin({ db, auth, sessionId, maxUser, roleFallback }) {
  const ref = db.collection('maxLoginSessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'session not found' };
  const sess = snap.data();
  if (sess.status === 'ready' && sess.token) return { ok: true, token: sess.token, already: true };

  const exp = sess.expiresAt?.toMillis?.() || 0;
  if (exp && Date.now() > exp) return { ok: false, reason: 'session expired' };

  const maxId = String(maxUser.id || maxUser.user_id || maxUser.userId);
  const uid = `max_${maxId}`;
  const displayName =
    [maxUser.first_name || maxUser.firstName, maxUser.last_name || maxUser.lastName]
      .filter(Boolean)
      .join(' ') ||
    maxUser.username ||
    maxUser.name ||
    'MAX user';
  const photoURL = maxUser.photo_url || maxUser.avatar_url || null;
  const username = maxUser.username
    ? String(maxUser.username).replace(/^@/, '').toLowerCase()
    : null;
  const role = sess.role === 'client' ? 'client' : roleFallback || 'master';

  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { displayName, photoURL: photoURL || null });
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid, displayName, photoURL: photoURL || undefined });
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const now = Date.now();
    await userRef.set({
      role,
      displayName,
      email: null,
      phone: null,
      photoURL,
      provider: 'max',
      providerId: maxId,
      maxId,
      maxUsername: username,
      notifyEmail: false,
      notifyPush: true,
      notifyMinutesBefore: 60,
      createdAt: FieldValue.serverTimestamp(),
      fcmTokens: [],
      subscriptionStatus: role === 'master' ? 'trial' : 'none',
      trialStartedAt: role === 'master' ? Timestamp.fromMillis(now) : null,
      subscriptionExpiresAt:
        role === 'master' ? Timestamp.fromMillis(now + 7 * 86400000) : null,
    });
  } else {
    await userRef.set(
      {
        displayName,
        photoURL,
        provider: 'max',
        providerId: maxId,
        maxId,
        maxUsername: username,
      },
      { merge: true }
    );
  }

  const token = await auth.createCustomToken(uid, { provider: 'max', maxId });
  await ref.set(
    {
      status: 'ready',
      token,
      uid,
      displayName,
      maxId,
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, token, uid, displayName };
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    // health / webhook verification
    return { statusCode: 200, body: 'max-bot-webhook ok' };
  }
  if (event.httpMethod !== 'POST') return ok();

  try {
    if (!process.env.MAX_BOT_TOKEN || !process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('missing env');
      return ok();
    }
    const update = JSON.parse(event.body || '{}');
    console.log('max webhook keys', Object.keys(update));

    const { from, chatId, text, startPayload } = pickUser(update);
    const sessionId =
      extractSession(startPayload) ||
      extractSession(text) ||
      extractSession(update?.message?.body?.text);

    if (!sessionId || !from) {
      // Ignore non-login messages quietly
      return ok();
    }

    const sa = parseSa(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { auth, db } = adminFor(sa);
    const result = await completeLogin({
      db,
      auth,
      sessionId,
      maxUser: from,
    });

    const appUrl = (process.env.APP_URL || process.env.URL || 'https://zapisipro.netlify.app').replace(
      /\/$/,
      ''
    );
    const backLink = `${appUrl}/auth?max_session=${sessionId}`;

    // Try to notify user in MAX (best-effort; API shape may vary)
    if (chatId && result.ok) {
      try {
        await maxApi('/messages', 'POST', {
          chat_id: chatId,
          text:
            '✅ Вход подтверждён.\n\nВернитесь в приложение по ссылке:\n' +
            backLink +
            '\n\nЕсли вкладка сайта ещё открыта — она войдёт автоматически.',
        });
      } catch (e) {
        console.warn('send message failed', e.message);
      }
    }

    return ok();
  } catch (e) {
    console.error('max-bot-webhook', e);
    return ok();
  }
}
