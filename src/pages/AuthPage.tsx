import { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { Alert, Button, Field, Input } from '../components/ui';
import { auth as fbAuth, isFirebaseConfigured } from '../lib/firebase';
import { Scissors, User } from 'lucide-react';

type Mode = 'login' | 'register';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramUser) => void;
    WebApp?: {
      initData?: string;
      initDataUnsafe?: Record<string, unknown>;
      platform?: string;
      version?: string;
      ready?: () => void;
      expand?: () => void;
    };
  }
}

function authErrorText(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code || '';
  const message = e?.message || '';
  if (message.includes('getApps is not a function') || message.includes('admin.getApps')) {
    return 'Сервер Telegram/MAX ещё со старым firebase-admin. Задеплойте новый telegram-auth.js / max-auth.js (v1.5).';
  }
  if (code === 'auth/invalid-custom-token' || code === 'auth/custom-token-mismatch') {
    return 'Firebase отклонил токен. FIREBASE_SERVICE_ACCOUNT и VITE_FIREBASE_PROJECT_ID должны быть из одного проекта.';
  }
  if (message.includes('The string did not match the expected pattern')) {
    return 'Браузер отклонил токен. Проверьте service account JSON, project_id и домен бота.';
  }
  return message || 'Не удалось войти';
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : 'Ошибка';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'Email уже зарегистрирован',
    'auth/invalid-email': 'Некорректный email',
    'auth/weak-password': 'Слабый пароль',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-credential': 'Неверный email или пароль',
  };
  return map[code] || msg;
}

async function exchangeProviderToken(endpoint: string, payload: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Auth service HTTP ${res.status}`);
  }
  await signInWithCustomToken(fbAuth, data.token);
}

export function AuthPage() {
  const appAuth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<UserRole>('master');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);
  const [maxLoading, setMaxLoading] = useState(false);
  const [insideMax, setInsideMax] = useState(false);

  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  const maxBotLink = (import.meta.env.VITE_MAX_BOT_LINK || '').trim();
  const maxEnabled = Boolean(import.meta.env.VITE_MAX_AUTH_ENABLED === 'true' || maxBotLink || import.meta.env.VITE_MAX_BOT_USERNAME);

  useEffect(() => {
    // Detect MAX mini-app runtime
    const probe = () => {
      const wa = window.WebApp;
      if (wa && (wa.initData || wa.initDataUnsafe)) {
        setInsideMax(true);
        try {
          wa.ready?.();
          wa.expand?.();
        } catch {
          /* ignore */
        }
      }
    };
    probe();
    const script = document.createElement('script');
    script.src = 'https://st.max.ru/js/max-web-app.js';
    script.async = true;
    script.onload = probe;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (!botUsername) return;

    window.onTelegramAuth = async (user: TelegramUser) => {
      setTgLoading(true);
      setError(null);
      try {
        const endpoint = import.meta.env.VITE_TELEGRAM_AUTH_URL || '/.netlify/functions/telegram-auth';
        await exchangeProviderToken(endpoint, { ...user, role });
      } catch (e) {
        setError(authErrorText(e));
      } finally {
        setTgLoading(false);
      }
    };

    const mount = document.getElementById('telegram-login-mount');
    if (!mount) return;
    mount.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    mount.appendChild(script);

    return () => {
      window.onTelegramAuth = undefined;
      mount.innerHTML = '';
    };
  }, [botUsername, role]);

  async function handleMaxLogin() {
    setError(null);
    setMaxLoading(true);
    try {
      const initData = window.WebApp?.initData || '';
      if (!initData) {
        if (maxBotLink) {
          window.location.href = maxBotLink;
          return;
        }
        throw new Error(
          'Откройте приложение внутри MAX (мини-приложение бота) или задайте VITE_MAX_BOT_LINK для перехода в MAX.'
        );
      }
      const endpoint = import.meta.env.VITE_MAX_AUTH_URL || '/.netlify/functions/max-auth';
      await exchangeProviderToken(endpoint, { initData, role });
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setMaxLoading(false);
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="center-page">
        <div className="auth-card card">
          <h1>Нужна настройка Firebase</h1>
          <p className="muted">Проверьте переменные VITE_FIREBASE_* в Netlify.</p>
        </div>
      </div>
    );
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await appAuth.signInEmail(email, password);
      else {
        if (!displayName.trim()) throw new Error('Укажите имя');
        await appAuth.registerEmail(email, password, displayName.trim(), role);
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
          Email · Telegram · MAX
        </p>

        <div className="card">
          <div className="tabs">
            <button type="button" className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(null); }}>
              Вход
            </button>
            <button type="button" className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(null); }}>
              Регистрация
            </button>
          </div>

          {mode === 'register' && (
            <div className="role-grid">
              <button type="button" className={`role-card ${role === 'master' ? 'active' : ''}`} onClick={() => setRole('master')}>
                <div className="title"><Scissors size={18} /> Мастер</div>
                <div className="desc">Календарь и записи</div>
              </button>
              <button type="button" className={`role-card ${role === 'client' ? 'active' : ''}`} onClick={() => setRole('client')}>
                <div className="title"><User size={18} /> Клиент</div>
                <div className="desc">Просмотр записей</div>
              </button>
            </div>
          )}

          {error && <Alert type="error">{error}</Alert>}
          {(tgLoading || maxLoading) && <Alert type="info">Подтверждение входа…</Alert>}

          <form onSubmit={handleEmail}>
            {mode === 'register' && (
              <Field label="Имя">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Пароль" hint="От 6 символов">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </Button>
          </form>

          {(botUsername || maxEnabled) && <div className="divider">или</div>}

          {botUsername && (
            <div style={{ marginBottom: 12 }}>
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                Бесплатный вход через Telegram
              </p>
              <div id="telegram-login-mount" className="telegram-login-mount" />
            </div>
          )}

          {maxEnabled && (
            <div>
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                {insideMax
                  ? 'Вы открыли приложение внутри MAX — можно войти одним нажатием'
                  : 'Вход через приложение MAX (мини-приложение бота)'}
              </p>
              <button type="button" className="max-login-button" onClick={handleMaxLogin} disabled={maxLoading}>
                {maxLoading ? 'Вход…' : insideMax ? 'Войти через MAX' : 'Открыть / войти через MAX'}
              </button>
              {!insideMax && (
                <p className="muted" style={{ fontSize: '0.72rem', textAlign: 'center', marginTop: 8 }}>
                  Для автоматического входа откройте сайт как мини-приложение MAX.
                  Если задан VITE_MAX_BOT_LINK — кнопка переведёт в MAX.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
            <button type="button" className={`role-card ${role === 'master' ? 'active' : ''}`} onClick={() => setRole('master')}>
              <div className="title">Мастер</div>
            </button>
            <button type="button" className={`role-card ${role === 'client' ? 'active' : ''}`} onClick={() => setRole('client')}>
              <div className="title">Клиент</div>
            </button>
          </div>
          <Field label="Имя">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={loading}>Далее</Button>
        </form>
      </div>
    </div>
  );
}
