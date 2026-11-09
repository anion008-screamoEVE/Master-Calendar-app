/**
 * Telegram Login Widget → Firebase Custom Token
 * Self-contained ESM (no relative imports — Netlify esbuild resolves only this file).
 */
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

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

function parseServiceAccount(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa?.project_id || !sa?.private_key || !sa?.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT incomplete (need project_id, private_key, client_email)');
  }
  return sa;
}

function getAdmin(sa, label) {
  const expected = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (expected && sa.project_id !== expected) {
    throw new Error(`Firebase project mismatch: env ${expected}, service account ${sa.project_id}`);
  }
  const name = `${label}-${sa.project_id}`;
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp({ credential: cert(sa), projectId: sa.project_id }, name);
  return { auth: getAuth(app), db: getFirestore(app) };
}

function verifyTelegramAuth(data, botToken) {
  if (!data?.hash || !data?.id || !data?.auth_date) return false;
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash' && k !== 'role')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const digest = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return safeEqualHex(digest, data.hash);
}

async function ensureAuthUser(auth, { uid, displayName, photoURL }) {
  try {
    const u = await auth.getUser(uid);
    if (u.displayName !== displayName || u.photoURL !== (photoURL || null)) {
      await auth.updateUser(uid, { displayName, photoURL: photoURL || null });
    }
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid, displayName, photoURL: photoURL || undefined });
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!botToken) return json(500, { error: 'TELEGRAM_BOT_TOKEN missing' });
    if (!rawSa) return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT missing' });
    if (!verifyTelegramAuth(body, botToken)) {
      return json(401, { error: 'Telegram signature check failed' });
    }
    const age = Math.floor(Date.now() / 1000) - Number(body.auth_date);
    if (age < -60 || age > 86400) return json(401, { error: 'Telegram login expired' });

    let sa;
    try {
      sa = parseServiceAccount(rawSa);
    } catch (e) {
      return json(500, { error: e.message });
    }

    const { auth, db } = getAdmin(sa, 'telegram');
    const uid = `tg_${String(body.id)}`;
    const displayName =
      [body.first_name, body.last_name].filter(Boolean).join(' ') ||
      body.username ||
      'Telegram user';
    const role = body.role === 'client' ? 'client' : 'master';
    const username = body.username ? String(body.username).replace(/^@/, '').toLowerCase() : null;
    const photoURL = body.photo_url || null;

    await ensureAuthUser(auth, { uid, displayName, photoURL });

    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const now = Date.now();
      await ref.set({
        role,
        displayName,
        email: null,
        phone: null,
        photoURL,
        provider: 'telegram',
        providerId: String(body.id),
        telegramId: String(body.id),
        telegramUsername: username,
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
      await ref.set(
        {
          displayName,
          photoURL,
          provider: 'telegram',
          providerId: String(body.id),
          telegramId: String(body.id),
          telegramUsername: username,
        },
        { merge: true }
      );
    }

    const token = await auth.createCustomToken(uid, {
      provider: 'telegram',
      telegramId: String(body.id),
    });
    return json(200, { token, uid, displayName, provider: 'telegram' });
  } catch (error) {
    console.error('telegram-auth failed:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Unexpected Telegram sign-in error',
    });
  }
}
