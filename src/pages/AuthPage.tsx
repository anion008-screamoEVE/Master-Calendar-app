import { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { Alert, Button, Field, Input } from '../components/ui';
import { auth as fbAuth, isFirebaseConfigured } from '../lib/firebase';
import { Scissors, User } from 'lucide-react';

type Mode = 'login' | 'register';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Auth: Email (no captcha) + optional Telegram Login (free, no Firebase Blaze SMS).
 * Set VITE_TELEGRAM_BOT_USERNAME in Netlify (bot from @BotFather).
 * Backend: Netlify function telegram-auth OR Firebase function (see SETUP).
 */
export function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<UserRole>('master');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

  useEffect(() => {
    if (!botUsername) return;

    window.onTelegramAuth = async (user: TelegramUser) => {
      setTgLoading(true);
      setError(null);
      try {
        const endpoint =
          (import.meta.env.VITE_TELEGRAM_AUTH_URL as string) ||
          '/.netlify/functions/telegram-auth';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...user, role }),
        });
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) {
          throw new Error(data.error || 'Telegram auth failed');
        }
        await signInWithCustomToken(fbAuth, data.token);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка Telegram');
      } finally {
        setTgLoading(false);
      }
    };

    // Inject Telegram widget script
    const id = 'telegram-login-script';
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.src = 'https://telegram.org/js/telegram-widget.js?22';
      s.async = true;
      s.setAttribute('data-telegram-login', botUsername);
      s.setAttribute('data-size', 'large');
      s.setAttribute('data-radius', '12');
      s.setAttribute('data-onauth', 'onTelegramAuth(user)');
      s.setAttribute('data-request-access', 'write');
      const mount = document.getElementById('telegram-login-mount');
      if (mount) mount.appendChild(s);
    }

    return () => {
      window.onTelegramAuth = undefined;
    };
  }, [botUsername, role]);

  if (!isFirebaseConfigured) {
    return (
      <div className="center-page">
        <div className="auth-card card">
          <h1>Нужна настройка Firebase</h1>
          <p className="muted">VITE_FIREBASE_* в Netlify</p>
        </div>
      </div>
    );
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await auth.signInEmail(email, password);
      else {
        if (!displayName.trim()) throw new Error('Укажите имя');
        await auth.registerEmail(email, password, displayName.trim(), role);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="logo-mark" aria-hidden>
          <Scissors color="white" size={28} />
        </div>
        <h1 style={{ textAlign: 'center' }}>Мастер-Календарь</h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 20 }}>
          Email без капчи · Telegram без Blaze SMS
        </p>

        <div className="card">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={`tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>

          {mode === 'register' && (
            <div className="role-grid">
              <button
                type="button"
                className={`role-card ${role === 'master' ? 'active' : ''}`}
                onClick={() => setRole('master')}
              >
                <div className="title">
                  <Scissors size={18} /> Мастер
                </div>
              </button>
              <button
                type="button"
                className={`role-card ${role === 'client' ? 'active' : ''}`}
                onClick={() => setRole('client')}
              >
                <div className="title">
                  <User size={18} /> Клиент
                </div>
              </button>
            </div>
          )}

          {error && <Alert type="error">{error}</Alert>}
          {tgLoading && <Alert type="info">Вход через Telegram…</Alert>}

          <form onSubmit={handleEmail}>
            {mode === 'register' && (
              <Field label="Имя">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Пароль" hint="От 6 символов, без reCAPTCHA">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </Button>
          </form>

          <div className="divider">или</div>

          {botUsername ? (
            <div>
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                Вход через Telegram (бесплатно, без SMS Firebase)
              </p>
              {mode === 'register' && (
                <p className="muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
                  Тип аккаунта выбран выше: {role === 'master' ? 'Мастер' : 'Клиент'}
                </p>
              )}
              <div
                id="telegram-login-mount"
                style={{ display: 'flex', justifyContent: 'center', minHeight: 48 }}
              />
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>
              <strong>Telegram-вход</strong>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                1. @BotFather → /newbot → получите username бота
                <br />
                2. Netlify env: <code>VITE_TELEGRAM_BOT_USERNAME</code>=MyBot
                <br />
                3. Задеплойте function <code>telegram-auth</code> (см. SETUP_V12)
                <br />
                Без Blaze Phone SMS. Email уже работает без капчи.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : 'Ошибка';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'Email уже зарегистрирован',
    'auth/invalid-email': 'Некорректный email',
    'auth/weak-password': 'Слабый пароль',
    'auth/user-not-found': 'Не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-credential': 'Неверный email или пароль',
  };
  return map[code] || msg;
}

export function CompleteProfilePage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState(auth.firebaseUser?.displayName || '');
  const [role, setRole] = useState<UserRole>('master');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await auth.completeProfile(displayName.trim(), role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card card">
        <h1>Профиль</h1>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={submit}>
          <div className="role-grid">
            <button
              type="button"
              className={`role-card ${role === 'master' ? 'active' : ''}`}
              onClick={() => setRole('master')}
            >
              <div className="title">Мастер</div>
            </button>
            <button
              type="button"
              className={`role-card ${role === 'client' ? 'active' : ''}`}
              onClick={() => setRole('client')}
            >
              <div className="title">Клиент</div>
            </button>
          </div>
          <Field label="Имя">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={loading}>
            Далее
          </Button>
        </form>
      </div>
    </div>
  );
}
