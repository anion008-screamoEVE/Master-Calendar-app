import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export function parseServiceAccount(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa || !sa.project_id || !sa.private_key || !sa.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT JSON is incomplete (need project_id, private_key, client_email)');
  }
  return sa;
}

export function getAdminForServiceAccount(serviceAccount, label = 'auth') {
  const expectedProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
    throw new Error(
      `Firebase project mismatch: frontend/project env is ${expectedProjectId}, service account is ${serviceAccount.project_id}`
    );
  }
  const appName = `${label}-${serviceAccount.project_id}`;
  const existing = getApps().find((app) => app.name === appName);
  const app = existing || initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, appName);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    FieldValue,
    Timestamp,
  };
}

export async function ensureAuthUser(auth, { uid, displayName, photoURL }) {
  try {
    const existing = await auth.getUser(uid);
    if (existing.displayName !== displayName || existing.photoURL !== (photoURL || null)) {
      await auth.updateUser(uid, { displayName, photoURL: photoURL || null });
    }
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, displayName, photoURL: photoURL || undefined });
  }
}

export async function upsertAppUser(db, FieldValue, Timestamp, {
  uid,
  role,
  displayName,
  photoURL = null,
  provider,
  providerId,
  username = null,
}) {
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
      provider,
      providerId: providerId == null ? null : String(providerId),
      telegramId: provider === 'telegram' ? String(providerId) : null,
      telegramUsername: provider === 'telegram' ? username : null,
      maxId: provider === 'max' ? String(providerId) : null,
      maxUsername: provider === 'max' ? username : null,
      notifyEmail: false,
      notifyPush: true,
      notifyMinutesBefore: 60,
      createdAt: FieldValue.serverTimestamp(),
      fcmTokens: [],
      subscriptionStatus: role === 'master' ? 'trial' : 'none',
      trialStartedAt: role === 'master' ? Timestamp.fromMillis(now) : null,
      subscriptionExpiresAt: role === 'master'
        ? Timestamp.fromMillis(now + 7 * 86400000)
        : null,
    });
  } else {
    const patch = {
      displayName,
      photoURL,
      provider,
      providerId: providerId == null ? null : String(providerId),
    };
    if (provider === 'telegram') {
      patch.telegramId = String(providerId);
      patch.telegramUsername = username;
    }
    if (provider === 'max') {
      patch.maxId = String(providerId);
      patch.maxUsername = username;
    }
    await ref.set(patch, { merge: true });
  }
}
