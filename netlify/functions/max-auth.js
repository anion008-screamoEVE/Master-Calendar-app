/**
 * MAX mini-app login → Firebase Custom Token
 * Self-contained ESM (no relative imports).
 * Validates WebAppData per https://dev.max.ru/docs/webapps/validation
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

function parseInitData(initData) {
  const params = new URLSearchParams(String(initData || ''));
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** MAX: secret = HMAC_SHA256(key='WebAppData', msg=BOT_TOKEN); hash = hex(HMAC_SHA256(secret, sorted pairs)) */
function verifyMaxInitData(initData, botToken) {
  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) return { ok: false, reason: 'hash missing' };

  const launchParams = Object.keys(params)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');

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
  return { ok: true, user, authDate: Number(params.auth_date || 0) };
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
    const botToken = process.env.MAX_BOT_TOKEN;
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!botToken) {
      return json(500, { error: 'MAX_BOT_TOKEN missing in Netlify env' });
    }
    if (!rawSa) return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT missing' });

    const initData = body.initData || body.WebAppData || body.webAppData || '';
    if (!initData) {
      return json(400, {
        error: 'MAX initData missing. Open the site inside MAX mini-app (WebApp.initData).',
      });
    }

    const verified = verifyMaxInitData(initData, botToken);
    if (!verified.ok) return json(401, { error: `MAX signature failed: ${verified.reason}` });
    if (!verified.user?.id) return json(401, { error: 'MAX user payload missing' });

    const age = Math.floor(Date.now() / 1000) - Number(verified.authDate || 0);
    if (age < -60 || age > 86400) return json(401, { error: 'MAX login data expired' });

    let sa;
    try {
      sa = parseServiceAccount(rawSa);
    } catch (e) {
      return json(500, { error: e.message });
    }

    const { auth, db } = getAdmin(sa, 'max');
    const user = verified.user;
    const uid = `max_${String(user.id)}`;
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.username ||
      'MAX user';
    const role = body.role === 'client' ? 'client' : 'master';
    const username = user.username ? String(user.username).replace(/^@/, '').toLowerCase() : null;
    const photoURL = user.photo_url || null;

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
        provider: 'max',
        providerId: String(user.id),
        maxId: String(user.id),
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
      await ref.set(
        {
          displayName,
          photoURL,
          provider: 'max',
          providerId: String(user.id),
          maxId: String(user.id),
          maxUsername: username,
        },
        { merge: true }
      );
    }

    const token = await auth.createCustomToken(uid, {
      provider: 'max',
      maxId: String(user.id),
    });
    return json(200, { token, uid, displayName, provider: 'max' });
  } catch (error) {
    console.error('max-auth failed:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Unexpected MAX sign-in error',
    });
  }
}
