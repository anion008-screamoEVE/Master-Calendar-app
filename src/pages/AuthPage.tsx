import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { Alert, Button, Field, Input } from '../components/ui';
import { isFirebaseConfigured } from '../lib/firebase';
import { Scissors, User } from 'lucide-react';

type Mode = 'login' | 'register';

/**
 * Phone Auth via Firebase Phone requires reCAPTCHA + paid SMS and often fails in RU.
 * We use Email as primary. Phone field is optional profile data.
 * For SMS login without reCAPTCHA see SETUP: SMS.ru / Telegram Login (recommended).
 */
export function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<UserRole>('master');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneOptional, setPhoneOptional] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isFirebaseConfigured) {
    return (
      <div className="center-page">
        <div className="auth-card card">
          <h1>Нужна настройка Firebase</h1>
          <p className="muted">
            Заполните VITE_FIREBASE_* в Netlify / .env.local
          </p>
        </div>
      </div>
    );
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await auth.signInEmail(email, password);
      } else {
        if (!displayName.trim()) throw new Error('Укажите имя');
        await auth.registerEmail(email, password, displayName.trim(), role);
        // phone optional — stored after profile exists via settings
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
          Записи · уведомления · совместная работа
        </p>

        <div className="card">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Вход
            </button>
            <button
              type="button"
              className={`tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Регистрация
            </button>
          </div>

          {mode === 'register' && (
            <>
              <p className="muted" style={{ marginBottom: 8 }}>
                Тип аккаунта
              </p>
              <div className="role-grid">
                <button
                  type="button"
                  className={`role-card ${role === 'master' ? 'active' : ''}`}
                  onClick={() => setRole('master')}
                >
                  <div className="title">
                    <Scissors size={18} style={{ verticalAlign: 'middle' }} /> Мастер
                  </div>
                  <div className="desc">Календарь, записи, подписка</div>
                </button>
                <button
                  type="button"
                  className={`role-card ${role === 'client' ? 'active' : ''}`}
                  onClick={() => setRole('client')}
                >
                  <div className="title">
                    <User size={18} style={{ verticalAlign: 'middle' }} /> Клиент
                  </div>
                  <div className="desc">Просмотр записей</div>
                </button>
              </div>
            </>
          )}

          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={handleEmail}>
            {mode === 'register' && (
              <Field label="Ваше имя">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoComplete="name"
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
                placeholder="you@mail.ru"
              />
            </Field>
            <Field label="Пароль" hint="Минимум 6 символов">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
            {mode === 'register' && (
              <Field label="Телефон (необязательно)" hint="Для связи, не для входа">
                <div className="phone-row">
                  <div className="phone-prefix">+7</div>
                  <Input
                    value={phoneOptional}
                    onChange={(e) =>
                      setPhoneOptional(e.target.value.replace(/[^\d\s()-]/g, ''))
                    }
                    placeholder="999 123-45-67"
                    inputMode="tel"
                  />
                </div>
              </Field>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </Button>
          </form>

          <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 0 }}>
            <strong>Вход по SMS</strong>
            <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
              Firebase Phone Auth требует reCAPTCHA и платные SMS — в РФ часто не работает.
              Сейчас вход: <b>email + пароль</b> (без капчи).
              <br />
              Для SMS без reCAPTCHA: <b>SMS.ru</b> / <b>SMSC.ru</b> + свой код в Cloud Function,
              или <b>Telegram Login Widget</b> (рекомендуем). Подробно — в SETUP_UPDATE_V11_RU.md
            </p>
          </div>
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
    'auth/weak-password': 'Слишком простой пароль',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-credential': 'Неверный email или пароль',
    'auth/too-many-requests': 'Слишком много попыток, подождите',
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
    setError(null);
    setLoading(true);
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
        <h1>Завершите регистрацию</h1>
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
            Продолжить
          </Button>
        </form>
      </div>
    </div>
  );
}
