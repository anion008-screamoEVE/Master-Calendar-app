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
  }
}

function telegramErrorText(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code || '';
  const message = e?.message || '';
  if (code === 'auth/invalid-custom-token' || code === 'auth/custom-token-mismatch') {
    return 'Firebase отклонил Telegram-токен: проверьте, что FIREBASE_SERVICE_ACCOUNT и VITE_FIREBASE_PROJECT_ID принадлежат одному Firebase-проекту. После правки Netlify env нужен новый deploy.';
  }
  if (message.includes('The string did not match the expected pattern')) {
    return 'Браузер отклонил Telegram/Firebase токен. Проверьте JSON FIREBASE_SERVICE_ACCOUNT, project_id и домен бота в @BotFather (/setdomain). Подробные шаги — SETUP_V12_TELEGRAM_FIX_RU.md.';
  }
  return message || 'Не удалось войти через Telegram';
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
  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');

  useEffect(() => {
    if (!botUsername) return;

    window.onTelegramAuth = async (user: TelegramUser) => {
      setTgLoading(true);
      setError(null);
      try {
        const endpoint = import.meta.env.VITE_TELEGRAM_AUTH_URL || '/.netlify/functions/telegram-auth';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...user, role }),
        });
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) throw new Error(data.error || `Telegram service returned HTTP ${res.status}`);
        await signInWithCustomToken(fbAuth, data.token);
      } catch (e) {
        setError(telegramErrorText(e));
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
        <div className="logo-mark" aria-hidden><Scissors color="white" size={28} /></div>
        <h1 style={{ textAlign: 'center' }}>Мастер-Календарь</h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 20 }}>
          Email без капчи · Telegram без Blaze SMS
        </p>
        <div className="card">
          <div className="tabs">
            <button type="button" className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(null); }}>Вход</button>
            <button type="button" className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(null); }}>Регистрация</button>
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
          {tgLoading && <Alert type="info">Подтверждение входа…</Alert>}

          <form onSubmit={handleEmail}>
            {mode === 'register' && <Field label="Имя"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></Field>}
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
            <Field label="Пароль" hint="От 6 символов"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
            <Button type="submit" disabled={loading}>{loading ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</Button>
          </form>

          {botUsername && (
            <>
              <div className="divider">или</div>
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>Бесплатный вход через Telegram</p>
              <div id="telegram-login-mount" className="telegram-login-mount" />
            </>
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
    'auth/user-not-found': 'Пользователь не найден',
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
    try { await auth.completeProfile(displayName.trim(), role); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setLoading(false); }
  }

  return (
    <div className="center-page">
      <div className="auth-card card">
        <h1>Профиль</h1>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={submit}>
          <div className="role-grid">
            <button type="button" className={`role-card ${role === 'master' ? 'active' : ''}`} onClick={() => setRole('master')}><div className="title">Мастер</div></button>
            <button type="button" className={`role-card ${role === 'client' ? 'active' : ''}`} onClick={() => setRole('client')}><div className="title">Клиент</div></button>
          </div>
          <Field label="Имя"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></Field>
          <Button type="submit" disabled={loading}>Далее</Button>
        </form>
      </div>
    </div>
  );
}
