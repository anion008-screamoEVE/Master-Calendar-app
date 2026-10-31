import { useCallback, useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { initMessaging, VAPID_KEY, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * FCM push. Works best when app is installed as PWA on the phone.
 * Requires VITE_FIREBASE_VAPID_KEY and HTTPS (Netlify).
 */
export function usePush() {
  const { firebaseUser, profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const enablePush = useCallback(async () => {
    setError(null);
    if (!firebaseUser) {
      setError('Войдите в аккаунт');
      return false;
    }
    if (!VAPID_KEY || VAPID_KEY === 'your_vapid_key') {
      setError('Задайте VITE_FIREBASE_VAPID_KEY в Netlify (Firebase → Cloud Messaging → Web Push certificates)');
      return false;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setError('Браузер не поддерживает уведомления');
      return false;
    }
    try {
      // iOS: only after Add to Home Screen
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Разрешение отклонено. В настройках телефона разрешите уведомления для сайта.');
        return false;
      }

      if (!('serviceWorker' in navigator)) {
        setError('Нужен Service Worker (откройте сайт по HTTPS / установите на экран Домой)');
        return false;
      }

      const messaging = await initMessaging();
      if (!messaging) {
        setError('Push не поддерживается (Safari без PWA / старый браузер)');
        return false;
      }

      // Prefer existing SW from vite-plugin-pwa
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      await navigator.serviceWorker.ready;

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: reg,
      });
      if (!token) {
        setError('Не удалось получить FCM token. Проверьте VAPID и домен.');
        return false;
      }

      const tokenId = `${firebaseUser.uid}_${token.slice(-12)}`;
      await setDoc(
        doc(db, 'fcmTokens', tokenId),
        {
          uid: firebaseUser.uid,
          token,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userAgent: navigator.userAgent,
          platform: navigator.platform || '',
        },
        { merge: true }
      );

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'Напоминание';
        const body = payload.notification?.body || '';
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
          });
        }
      });

      setReady(true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка push';
      setError(msg);
      return false;
    }
  }, [firebaseUser]);

  // Auto-try if already granted
  useEffect(() => {
    if (
      firebaseUser &&
      profile?.notifyPush !== false &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      !ready
    ) {
      void enablePush();
    }
  }, [firebaseUser?.uid, profile?.notifyPush]);

  return {
    permission,
    error,
    enablePush,
    ready,
    pushEnabled: ready && permission === 'granted',
  };
}
