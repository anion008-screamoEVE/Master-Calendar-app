import { useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { Alert, Button, Field, Input } from '../components/ui';
import { isValidRuPhone, normalizePhone } from '../lib/phone';
import { isFirebaseConfigured } from '../lib/firebase';
import { Scissors, User } from 'lucide-react';

type Mode = 'login' | 'register';
type Method = 'email' | 'phone';

export function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [method, setMethod] = useState<Method>('email');
  const [role, setRole] = useState<UserRole>('master');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  if (!isFirebaseConfigured) {
    return (
      <div className="center-page">
        <div className="auth-card card">
          <h1>Нужна настройка Firebase</h1>
          <p className="muted">
            Создайте <code>.env.local</code> / переменные Netlify по образцу{' '}
            <code>.env.example</code>.
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

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const full = normalizePhone('+7' + phoneLocal.replace(/\D/g, ''));
    if (!isValidRuPhone(full)) {
      setError('Введите корректный номер: 10 цифр после +7');
      return;
    }
    if (mode === 'register' && !displayName.trim()) {
      setError('Укажите имя');
      return;
    }
    setLoading(true);
    try {
      if (verifierRef.current) {
        try {
          verifierRef.current.clear();
        } catch {
          /* ignore */
        }
      }
      verifierRef.current = auth.setupRecaptcha('recaptcha-container');
      confirmationRef.current = await auth.sendPhoneCode(full, verifierRef.current);
      setStep('code');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!confirmationRef.current) return;
    setLoading(true);
    try {
      await auth.confirmPhone(confirmationRef.current, smsCode, {
        displayName: displayName.trim() || undefined,
        role: mode === 'register' ? role : undefined,
      });
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
          Записи клиентов · уведомления · совместная работа
        </p>
        <div className="card">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setStep('form');
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
                setStep('form');
                setError(null);
              }}
            >
              Регистрация
            </button>
          </div>

          {mode === 'register' && step === 'form' && (
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

          <div className="tabs">
            <button
              type="button"
              className={`tab ${method === 'email' ? 'active' : ''}`}
              onClick={() => {
                setMethod('email');
                setStep('form');
              }}
            >
              Email
            </button>
            <button
              type="button"
              className={`tab ${method === 'phone' ? 'active' : ''}`}
              onClick={() => {
                setMethod('phone');
                setStep('form');
              }}
            >
              Телефон
            </button>
          </div>

          {error && <Alert type="error">{error}</Alert>}

          {method === 'email' && (
            <form onSubmit={handleEmail}>
              {mode === 'register' && (
                <Field label="Ваше имя">
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </Field>
              )}
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Пароль" hint="Минимум 6 символов">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </Field>
              <Button type="submit" disabled={loading}>
                {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </Button>
            </form>
          )}

          {method === 'phone' && step === 'form' && (
            <form onSubmit={sendCode}>
              {mode === 'register' && (
                <Field label="Ваше имя">
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </Field>
              )}
              <Field label="Номер телефона">
                <div className="phone-row">
                  <div className="phone-prefix">+7</div>
                  <Input
                    value={phoneLocal}
                    onChange={(e) => setPhoneLocal(e.target.value.replace(/[^\d\s()-]/g, ''))}
                    placeholder="999 123-45-67"
                    inputMode="tel"
                    required
                  />
                </div>
              </Field>
              <Button type="submit" disabled={loading}>
                {loading ? 'Отправка…' : 'Получить код'}
              </Button>
            </form>
          )}

          {method === 'phone' && step === 'code' && (
            <form onSubmit={confirmCode}>
              <Alert type="info">Код отправлен на +7{phoneLocal.replace(/\D/g, '')}</Alert>
              <Field label="Код из SMS">
                <Input
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  required
                />
              </Field>
              <div className="btn-row">
                <Button type="button" variant="secondary" onClick={() => setStep('form')}>
                  Назад
                </Button>
                <Button type="submit" disabled={loading || smsCode.length < 6}>
                  {loading ? 'Проверка…' : 'Подтвердить'}
                </Button>
              </div>
            </form>
          )}
          <div id="recaptcha-container" />
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
    'auth/invalid-phone-number': 'Некорректный номер телефона',
    'auth/invalid-verification-code': 'Неверный код из SMS',
    'auth/operation-not-allowed': 'Способ входа не включён в Firebase Console',
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
