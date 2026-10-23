import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { createUserProfile, getUserProfile, subscribeUser } from '../lib/api';
import type { AppUser, UserRole } from '../types';
import { normalizePhone } from '../lib/phone';
import { isSubscriptionActive } from '../lib/subscription';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: AppUser | null;
  loading: boolean;
  configured: boolean;
  isMaster: boolean;
  isClient: boolean;
  canUseApp: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (
    email: string,
    password: string,
    displayName: string,
    role: UserRole
  ) => Promise<void>;
  setupRecaptcha: (containerId: string) => RecaptchaVerifier;
  sendPhoneCode: (phone: string, verifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  confirmPhone: (
    confirmation: ConfirmationResult,
    code: string,
    meta?: { displayName?: string; role?: UserRole }
  ) => Promise<void>;
  completeProfile: (displayName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const p = await getUserProfile(user.uid);
      setProfile(p);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeUser(firebaseUser.uid, setProfile);
  }, [firebaseUser?.uid]);

  const value = useMemo<AuthContextValue>(() => {
    const isMaster = profile?.role === 'master';
    const isClient = profile?.role === 'client';
    const canUseApp = isClient || (isMaster && isSubscriptionActive(profile));

    return {
      firebaseUser,
      profile,
      loading,
      configured: isFirebaseConfigured,
      isMaster: Boolean(isMaster),
      isClient: Boolean(isClient),
      canUseApp: Boolean(canUseApp),

      async signInEmail(email, password) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },

      async registerEmail(email, password, displayName, role) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName });
        await createUserProfile(cred.user.uid, {
          role,
          displayName,
          email: email.trim().toLowerCase(),
          phone: cred.user.phoneNumber,
        });
      },

      setupRecaptcha(containerId: string) {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = '';
        return new RecaptchaVerifier(auth, containerId, {
          size: 'invisible',
          callback: () => undefined,
        });
      },

      async sendPhoneCode(phone, verifier) {
        return signInWithPhoneNumber(auth, normalizePhone(phone), verifier);
      },

      async confirmPhone(confirmation, code, meta) {
        const result = await confirmation.confirm(code);
        const user = result.user;
        const existing = await getUserProfile(user.uid);
        if (!existing && meta?.role && meta?.displayName) {
          await updateProfile(user, { displayName: meta.displayName });
          await createUserProfile(user.uid, {
            role: meta.role,
            displayName: meta.displayName,
            email: user.email,
            phone: user.phoneNumber,
          });
        }
      },

      async completeProfile(displayName, role) {
        if (!auth.currentUser) throw new Error('Не авторизован');
        await updateProfile(auth.currentUser, { displayName });
        await createUserProfile(auth.currentUser.uid, {
          role,
          displayName,
          email: auth.currentUser.email,
          phone: auth.currentUser.phoneNumber,
        });
        setProfile(await getUserProfile(auth.currentUser.uid));
      },

      async signOut() {
        await fbSignOut(auth);
        setProfile(null);
      },

      async refreshProfile() {
        if (!auth.currentUser) return;
        setProfile(await getUserProfile(auth.currentUser.uid));
      },
    };
  }, [firebaseUser, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
