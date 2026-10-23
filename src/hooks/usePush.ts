import { useCallback, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { initMessaging, VAPID_KEY, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export function usePush() {
  const { firebaseUser, profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [error, setError] = useState<string | null>(null);

  const enablePush = useCallback(async () => {
    setError(null);
    if (!firebaseUser) {
      setError('Войдите в аккаунт');
      return false;
    }
    if (!VAPID_KEY) {
      setError('VAPID ключ не настроен (VITE_FIREBASE_VAPID_KEY)');
      return false;
    }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Разрешение на уведомления отклонено');
        return false;
      }
      const messaging = await initMessaging();
      if (!messaging) {
        setError('Push не поддерживается в этом браузере');
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) {
        setError('Не удалось получить FCM token');
        return false;
      }
      await setDoc(doc(db, 'fcmTokens', `${firebaseUser.uid}_${token.slice(0, 12)}`), {
        uid: firebaseUser.uid,
        token,
        createdAt: Timestamp.now(),
        userAgent: navigator.userAgent,
      });
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'Напоминание';
        const body = payload.notification?.body || '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icons/icon-192.png' });
        }
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка push');
      return false;
    }
  }, [firebaseUser]);

  return {
    permission,
    error,
    enablePush,
    pushEnabled: profile?.notifyPush && permission === 'granted',
  };
}
