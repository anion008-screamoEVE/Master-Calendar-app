import crypto from 'node:crypto';
import {
  parseServiceAccount,
  getAdminForServiceAccount,
  ensureAuthUser,
  upsertAppUser,
} from './lib/firebase-admin.mjs';

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

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!botToken) return json(500, { error: 'Netlify variable TELEGRAM_BOT_TOKEN is missing.' });
    if (!rawServiceAccount) return json(500, { error: 'Netlify variable FIREBASE_SERVICE_ACCOUNT is missing.' });
    if (!verifyTelegramAuth(body, botToken)) {
      return json(401, { error: 'Telegram signature check failed. Check TELEGRAM_BOT_TOKEN matches the bot.' });
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - Number(body.auth_date);
    if (ageSeconds < -60 || ageSeconds > 86400) {
      return json(401, { error: 'Telegram login expired. Please try again.' });
    }

    let serviceAccount;
    try {
      serviceAccount = parseServiceAccount(rawServiceAccount);
    } catch (error) {
      return json(500, { error: error.message || 'Invalid FIREBASE_SERVICE_ACCOUNT' });
    }

    const { auth, db, FieldValue, Timestamp } = getAdminForServiceAccount(serviceAccount, 'telegram');
    const uid = `tg_${String(body.id)}`;
    const displayName =
      [body.first_name, body.last_name].filter(Boolean).join(' ') ||
      body.username ||
      'Telegram user';
    const role = body.role === 'client' ? 'client' : 'master';
    const username = body.username ? String(body.username).replace(/^@/, '').toLowerCase() : null;

    await ensureAuthUser(auth, { uid, displayName, photoURL: body.photo_url || null });
    await upsertAppUser(db, FieldValue, Timestamp, {
      uid,
      role,
      displayName,
      photoURL: body.photo_url || null,
      provider: 'telegram',
      providerId: body.id,
      username,
    });

    const token = await auth.createCustomToken(uid, {
      provider: 'telegram',
      telegramId: String(body.id),
    });
    return json(200, { token, uid, displayName, provider: 'telegram' });
  } catch (error) {
    console.error('telegram-auth failed:', error);
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected Telegram sign-in error' });
  }
}
