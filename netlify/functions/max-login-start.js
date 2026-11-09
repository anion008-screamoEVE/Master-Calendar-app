/**
 * Start external MAX login (site stays outside MAX mini-app).
 * Creates a short-lived session and returns a deep-link into the MAX bot.
 *
 * Env:
 *   MAX_BOT_TOKEN
 *   MAX_BOT_USERNAME          — bot username without @ (for max.ru link)
 *   MAX_BOT_DEEP_LINK         — optional full start link template
 *   FIREBASE_SERVICE_ACCOUNT
 *   FIREBASE_PROJECT_ID
 *   APP_URL                  — https://zapisipro.netlify.app
 */
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
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

function parseSa(raw) {
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa?.project_id || !sa?.private_key || !sa?.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT incomplete');
  }
  return sa;
}

function dbFor(sa) {
  const name = `max-start-${sa.project_id}`;
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp({ credential: cert(sa), projectId: sa.project_id }, name);
  return getFirestore(app);
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const role = body.role === 'client' ? 'client' : 'master';
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
    const botUsername = (process.env.MAX_BOT_USERNAME || process.env.VITE_MAX_BOT_USERNAME || '').replace(/^@/, '');
    const deepTpl = process.env.MAX_BOT_DEEP_LINK || '';
    if (!rawSa) return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT missing' });
    if (!botUsername && !deepTpl) {
      return json(500, {
        error: 'Set MAX_BOT_USERNAME (or MAX_BOT_DEEP_LINK) in Netlify env so we can open the MAX bot.',
      });
    }

    const sa = parseSa(rawSa);
    const db = dbFor(sa);
    const sessionId = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.collection('maxLoginSessions').doc(sessionId).set({
      status: 'pending',
      role,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
      token: null,
      uid: null,
      displayName: null,
    });

    // Payload the bot will receive on /start — keep short
    const startPayload = `login_${sessionId}`;
    const botLink = deepTpl
      ? deepTpl.replace('{payload}', encodeURIComponent(startPayload)).replace('{session}', sessionId)
      : `https://max.ru/${botUsername}?start=${encodeURIComponent(startPayload)}`;

    const appUrl = (process.env.APP_URL || process.env.URL || 'https://zapisipro.netlify.app').replace(/\/$/, '');
    const pollUrl = `${appUrl}/.netlify/functions/max-login-poll?session=${sessionId}`;

    return json(200, {
      sessionId,
      botLink,
      pollUrl,
      expiresInSec: 600,
      hint: 'Откройте ссылку в MAX, нажмите Start у бота. После подтверждения вас вернёт в приложение.',
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || 'max-login-start failed' });
  }
}
