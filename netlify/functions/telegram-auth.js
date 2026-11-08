import crypto from 'node:crypto';
import * as admin from 'firebase-admin';

/** Telegram Login Widget -> Firebase Custom Token (Netlify ESM Function). */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function safeEqualHex(a, b) {
  const aa = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function verifyTelegramAuth(data, botToken) {
  if (!data || !data.hash || !data.id || !data.auth_date) return false;
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash' && key !== 'role')
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const digest = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return safeEqualHex(digest, data.hash);
}

function appForProject(sa) {
  const appName = `telegram-auth-${sa.project_id || 'default'}`;
  const existing = admin.getApps().find((app) => app.name === appName);
  if (existing) return existing;
  return admin.initializeApp(
    {
      credential: admin.cert(sa),
      projectId: sa.project_id,
    },
    appName
  );
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const expectedProjectId = process.env.FIREBASE_PROJECT_ID;

    if (!botToken) return json(500, { error: 'Netlify variable TELEGRAM_BOT_TOKEN is missing.' });
    if (!rawServiceAccount) return json(500, { error: 'Netlify variable FIREBASE_SERVICE_ACCOUNT is missing.' });

    if (!verifyTelegramAuth(body, botToken)) {
      return json(401, { error: 'Telegram signature check failed. Check that TELEGRAM_BOT_TOKEN belongs to the configured bot.' });
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - Number(body.auth_date);
    if (ageSeconds < -60 || ageSeconds > 86400) {
      return json(401, { error: 'Telegram login expired. Please try again.' });
    }

    let serviceAccount;
    try {
      serviceAccount = typeof rawServiceAccount === 'string'
        ? JSON.parse(rawServiceAccount)
        : rawServiceAccount;
    } catch {
      return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Set the full service-account JSON.' });
    }

    if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
      return json(500, {
        error: `Firebase project mismatch: frontend project is ${expectedProjectId}, service account project is ${serviceAccount.project_id}. Use a service account from the same Firebase project.`,
      });
    }

    const app = appForProject(serviceAccount);
    const firebaseAuth = admin.getAuth(app);
    const firestore = admin.getFirestore(app);
    const uid = `tg_${String(body.id)}`;
    const displayName =
      [body.first_name, body.last_name].filter(Boolean).join(' ') ||
      body.username ||
      'Telegram user';
    const role = body.role === 'client' ? 'client' : 'master';
    const telegramUsername = body.username
      ? String(body.username).replace(/^@/, '').toLowerCase()
      : null;

    // Custom tokens require a Firebase Authentication user.
    try {
      const existingUser = await firebaseAuth.getUser(uid);
      if (existingUser.displayName !== displayName || existingUser.photoURL !== (body.photo_url || null)) {
        await firebaseAuth.updateUser(uid, {
          displayName,
          photoURL: body.photo_url || null,
        });
      }
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      await firebaseAuth.createUser({
        uid,
        displayName,
        photoURL: body.photo_url || undefined,
      });
    }

    const userRef = firestore.collection('users').doc(uid);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      const now = Date.now();
      await userRef.set({
        role,
        displayName,
        email: null,
        phone: null,
        photoURL: body.photo_url || null,
        telegramId: String(body.id),
        telegramUsername,
        notifyEmail: false,
        notifyPush: true,
        notifyMinutesBefore: 60,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        fcmTokens: [],
        subscriptionStatus: role === 'master' ? 'trial' : 'none',
        trialStartedAt: role === 'master' ? admin.firestore.Timestamp.fromMillis(now) : null,
        subscriptionExpiresAt: role === 'master'
          ? admin.firestore.Timestamp.fromMillis(now + 7 * 86400000)
          : null,
      });
    } else {
      await userRef.set(
        {
          displayName,
          photoURL: body.photo_url || null,
          telegramId: String(body.id),
          telegramUsername,
        },
        { merge: true }
      );
    }

    const token = await firebaseAuth.createCustomToken(uid, {
      provider: 'telegram',
      telegramId: String(body.id),
    });

    return json(200, { token, uid, displayName });
  } catch (error) {
    console.error('telegram-auth failed:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Unexpected Telegram sign-in error',
    });
  }
}
