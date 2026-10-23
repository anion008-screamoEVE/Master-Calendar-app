import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../contexts/AuthContext';
import { daysLeft, isSubscriptionActive, subscriptionLabel } from '../lib/subscription';
import { SUBSCRIPTION_PRICE_RUB, TRIAL_DAYS } from '../types';
import { Alert, Button } from '../components/ui';
import { functions } from '../lib/firebase';

export function SubscriptionPage() {
  const { profile, refreshProfile, isMaster } = useAuth();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isMaster || !profile) {
    return (
      <div>
        <h1>Подписка</h1>
        <Alert type="info">Подписка только для Мастера. Клиенты — бесплатно.</Alert>
      </div>
    );
  }

  const active = isSubscriptionActive(profile);
  const left = daysLeft(profile);

  async function pay() {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const createPayment = httpsCallable(functions, 'createSubscriptionPayment');
      const res = await createPayment({ plan: 'monthly' });
      const data = res.data as { confirmationUrl?: string; demo?: boolean; activated?: boolean };
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
        return;
      }
      if (data.demo || data.activated) {
        await refreshProfile();
        setMsg('Подписка активирована на 30 дней (демо Cloud Function).');
        return;
      }
      setMsg('Платёж создан.');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const notFound =
        err?.message?.includes('not-found') ||
        err?.code === 'functions/not-found' ||
        err?.message?.includes('NOT_FOUND');
      setError(
        notFound
          ? 'Cloud Function не задеплоена: firebase deploy --only functions'
          : err?.message || 'Ошибка оплаты'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Подписка</h1>
      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div className="price-tag">
          {SUBSCRIPTION_PRICE_RUB} <span>₽ / месяц</span>
        </div>
        <p className="muted">Первые {TRIAL_DAYS} дней бесплатно.</p>
        <div
          className="badge"
          style={{
            marginTop: 8,
            background: active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
            color: active ? '#86efac' : '#fca5a5',
            padding: '8px 14px',
          }}
        >
          {subscriptionLabel(profile)}
        </div>
      </div>
      <div className="card">
        {msg && <Alert type="success">{msg}</Alert>}
        {error && <Alert type="error">{error}</Alert>}
        <Button onClick={pay} disabled={loading}>
          {loading
            ? 'Обработка…'
            : active
              ? `Продлить (${left} дн. осталось)`
              : 'Оплатить 200 ₽'}
        </Button>
      </div>
    </div>
  );
}
