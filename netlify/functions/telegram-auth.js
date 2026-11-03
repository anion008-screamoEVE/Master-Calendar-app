/** Telegram Login Widget -> Firebase Custom Token (Netlify Function). */
const crypto = require('crypto');
const admin = require('firebase-admin');

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

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function verifyTelegramAuth(data, botToken) {
  if (!data || !data.hash || !data.id || !data.auth_date) return false;
  // Telegram Widget signature: sort all returned fields except hash; app-specific `role` is excluded.
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash' && k !== 'role')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const digest = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return safeEqual(digest, data.hash);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
    const expectedProjectId = process.env.FIREBASE_PROJECT_ID;

    if (!botToken) return json(500, { error: 'Netlify environment variable TELEGRAM_BOT_TOKEN is missing' });
    if (!rawSa) return json(500, { error: 'Netlify environment variable FIREBASE_SERVICE_ACCOUNT is missing' });

    if (!verifyTelegramAuth(body, botToken)) {
      return json(401, { error: 'Telegram signature check failed. Check TELEGRAM_BOT_TOKEN matches the bot.' });
    }
    const authAge = Math.floor(Date.now() / 1000) - Number(body.auth_date);
    if (authAge < -60 || authAge > 86400) return json(401, { error: 'Telegram login expired. Try again.' });

    let sa;
    try {
      sa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
    } catch {
      return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the full service-account JSON.' });
    }
    if (expectedProjectId && sa.project_id !== expectedProjectId) {
      return json(500, {
        error: `Firebase project mismatch: frontend uses ${expectedProjectId}, service account uses ${sa.project_id}. Download service-account JSON from the same Firebase project.`,
      });
    }

    const appName = 'telegram-auth-' + (sa.project_id || 'default');
    let app = admin.apps.find((a) => a.name === appName);
    if (!app) {
      app = admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id }, appName);
    }
    const auth = admin.auth(app);
    const db = admin.firestore(app);
    const uid = `tg_${String(body.id)}`;
    const displayName = [body.first_name, body.last_name].filter(Boolean).join(' ') || body.username || 'Telegram user';
    const role = body.role === 'client' ? 'client' : 'master';

    let authUser;
    try {
      authUser = await auth.getUser(uid);
      if (authUser.displayName !== displayName || authUser.photoURL !== (body.photo_url || null)) {
        await auth.updateUser(uid, { displayName, photoURL: body.photo_url || null });
      }
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      authUser = await auth.createUser({ uid, displayName, photoURL: body.photo_url || undefined });
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
        photoURL: body.photo_url || null,
        telegramId: String(body.id),
        telegramUsername: body.username || null,
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
    }

    const customToken = await auth.createCustomToken(uid, { provider: 'telegram', telegramId: String(body.id) });
    return json(200, { token: customToken, uid, displayName });
  } catch (e) {
    console.error('telegram-auth failed:', e);
    return json(500, { error: e && e.message ? e.message : 'Unexpected Telegram sign-in error' });
  }
};
