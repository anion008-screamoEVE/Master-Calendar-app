/**
 * Netlify Function: Telegram Login Widget → Firebase Custom Token
 * Free — no Firebase Blaze Phone / no reCAPTCHA.
 *
 * Netlify Environment variables (NOT VITE_):
 *   TELEGRAM_BOT_TOKEN          — from @BotFather
 *   FIREBASE_SERVICE_ACCOUNT    — full service account JSON as one string
 *
 * BotFather: /setdomain → your-site.netlify.app
 */
const crypto = require('crypto');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!botToken || !saRaw) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Set TELEGRAM_BOT_TOKEN and FIREBASE_SERVICE_ACCOUNT in Netlify env',
        }),
      };
    }

    if (!verifyTelegramAuth(body, botToken)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid Telegram signature' }) };
    }

    const age = Math.floor(Date.now() / 1000) - Number(body.auth_date || 0);
    if (age > 86400) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Telegram auth expired' }) };
    }

    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const sa = typeof saRaw === 'string' ? JSON.parse(saRaw) : saRaw;
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }

    const uid = 'tg_' + String(body.id);
    const displayName =
      [body.first_name, body.last_name].filter(Boolean).join(' ') ||
      body.username ||
      'Telegram';
    const role = body.role === 'client' ? 'client' : 'master';

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      const now = Date.now();
      const trialDays = 7;
      const payload = {
        role,
        displayName,
        email: null,
        phone: null,
        photoURL: body.photo_url || null,
        telegramId: body.id,
        telegramUsername: body.username || null,
        notifyEmail: true,
        notifyPush: true,
        notifyMinutesBefore: 60,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        fcmTokens: [],
        subscriptionStatus: role === 'master' ? 'trial' : 'none',
        trialStartedAt:
          role === 'master' ? admin.firestore.Timestamp.fromMillis(now) : null,
        subscriptionExpiresAt:
          role === 'master'
            ? admin.firestore.Timestamp.fromMillis(now + trialDays * 86400000)
            : null,
      };
      await userRef.set(payload);
    }

    // Ensure auth user exists for custom token
    try {
      await admin.auth().getUser(uid);
    } catch {
      await admin.auth().createUser({
        uid,
        displayName,
        photoURL: body.photo_url || undefined,
      });
    }

    const token = await admin.auth().createCustomToken(uid, {
      provider: 'telegram',
      telegramId: body.id,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ token }) };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || 'Server error' }),
    };
  }
};

function verifyTelegramAuth(data, botToken) {
  const hash = data.hash;
  if (!hash) return false;
  const pairs = Object.keys(data)
    .filter((k) => k !== 'hash' && k !== 'role')
    .sort()
    .map((k) => k + '=' + data[k]);
  const checkString = pairs.join('\n');
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  return hmac === hash;
}
