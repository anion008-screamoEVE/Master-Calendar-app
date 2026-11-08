import crypto from 'node:crypto';
import {
  parseServiceAccount,
  getAdminForServiceAccount,
  ensureAuthUser,
  upsertAppUser,
} from './lib/firebase-admin.mjs';

/**
 * MAX mini-app login.
 * Validates WebAppData / initData from MAX Bridge and issues Firebase custom token.
 * Docs: https://dev.max.ru/docs/webapps/validation
 */
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

function parseInitData(initData) {
  const params = new URLSearchParams(String(initData || ''));
  const entries = [];
  for (const [key, value] of params.entries()) entries.push([key, value]);
  return Object.fromEntries(entries);
}

/**
 * MAX validation:
 * secret_key = HMAC_SHA256(key='WebAppData', msg=BOT_TOKEN)
 * hash = hex(HMAC_SHA256(key=secret_key, msg=sorted key=value lines without hash))
 */
function verifyMaxInitData(initData, botToken) {
  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) return { ok: false, reason: 'hash missing' };

  const pairs = Object.keys(params)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${params[key]}`);
  const launchParams = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(launchParams).digest('hex');
  if (!safeEqualHex(calculated, hash)) return { ok: false, reason: 'bad signature' };

  let user = null;
  if (params.user) {
    try {
      user = JSON.parse(params.user);
    } catch {
      return { ok: false, reason: 'invalid user json' };
    }
  }
  const authDate = Number(params.auth_date || 0);
  return { ok: true, user, authDate, params };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.MAX_BOT_TOKEN;
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!botToken) {
      return json(500, {
        error: 'MAX_BOT_TOKEN is missing in Netlify. Create a MAX bot at business.max.ru and set the token.',
      });
    }
    if (!rawServiceAccount) return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT is missing' });

    const initData = body.initData || body.WebAppData || body.webAppData || '';
    if (!initData) {
      return json(400, {
        error: 'MAX initData is missing. Open the app inside MAX mini-app (WebApp.initData).',
      });
    }

    const verified = verifyMaxInitData(initData, botToken);
    if (!verified.ok) return json(401, { error: `MAX signature check failed: ${verified.reason}` });
    if (!verified.user || !verified.user.id) {
      return json(401, { error: 'MAX user payload is missing after validation' });
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - Number(verified.authDate || 0);
    if (ageSeconds < -60 || ageSeconds > 86400) {
      return json(401, { error: 'MAX login data expired. Re-open the mini-app.' });
    }

    let serviceAccount;
    try {
      serviceAccount = parseServiceAccount(rawServiceAccount);
    } catch (error) {
      return json(500, { error: error.message || 'Invalid FIREBASE_SERVICE_ACCOUNT' });
    }

    const { auth, db, FieldValue, Timestamp } = getAdminForServiceAccount(serviceAccount, 'max');
    const user = verified.user;
    const uid = `max_${String(user.id)}`;
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.username ||
      'MAX user';
    const role = body.role === 'client' ? 'client' : 'master';
    const username = user.username ? String(user.username).replace(/^@/, '').toLowerCase() : null;

    await ensureAuthUser(auth, { uid, displayName, photoURL: user.photo_url || null });
    await upsertAppUser(db, FieldValue, Timestamp, {
      uid,
      role,
      displayName,
      photoURL: user.photo_url || null,
      provider: 'max',
      providerId: user.id,
      username,
    });

    const token = await auth.createCustomToken(uid, {
      provider: 'max',
      maxId: String(user.id),
    });
    return json(200, { token, uid, displayName, provider: 'max' });
  } catch (error) {
    console.error('max-auth failed:', error);
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected MAX sign-in error' });
  }
}
