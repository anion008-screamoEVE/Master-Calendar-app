/**
 * Poll MAX external login session. When bot webhook confirmed the user,
 * returns Firebase custom token for the browser.
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function parseSa(raw) {
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa?.project_id) throw new Error('bad service account');
  return sa;
}

function dbFor(sa) {
  const name = `max-poll-${sa.project_id}`;
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp({ credential: cert(sa), projectId: sa.project_id }, name);
  return getFirestore(app);
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const sessionId = event.queryStringParameters?.session || '';
    if (!sessionId || !/^[a-f0-9]{32}$/i.test(sessionId)) {
      return json(400, { error: 'session required' });
    }
    const sa = parseSa(process.env.FIREBASE_SERVICE_ACCOUNT);
    const db = dbFor(sa);
    const snap = await db.collection('maxLoginSessions').doc(sessionId).get();
    if (!snap.exists) return json(404, { status: 'missing' });
    const data = snap.data();
    const exp = data.expiresAt?.toMillis?.() || 0;
    if (exp && Date.now() > exp && data.status !== 'ready') {
      return json(410, { status: 'expired' });
    }
    if (data.status === 'ready' && data.token) {
      return json(200, {
        status: 'ready',
        token: data.token,
        uid: data.uid,
        displayName: data.displayName,
      });
    }
    return json(200, { status: data.status || 'pending' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message || 'poll failed' });
  }
}
