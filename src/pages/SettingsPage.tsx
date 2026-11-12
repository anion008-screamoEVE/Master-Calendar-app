import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateUserProfile } from '../lib/api';
import { usePush } from '../hooks/usePush';
import { Alert, Button, Field, Input, Select, Switch } from '../components/ui';
import { subscriptionLabel } from '../lib/subscription';
import { formatPhoneDisplay } from '../lib/phone';
import { useTheme } from '../contexts/ThemeContext';

export function SettingsPage() {
  const { profile, firebaseUser, signOut, isMaster, refreshProfile, deleteAccount } = useAuth();
  const push = usePush();
  const { theme, toggleTheme } = useTheme();
  const [name, setName] = useState(profile?.displayName || '');
  const [mins, setMins] = useState(String(profile?.notifyMinutesBefore ?? 60));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!profile || !firebaseUser) return null;

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await updateUserProfile(firebaseUser!.uid, {
        displayName: name.trim() || profile!.displayName,
        notifyMinutesBefore: Number(mins) || 60,
      });
      await refreshProfile();
      setMsg('Сохранено');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(field: 'notifyEmail' | 'notifyPush') {
    if (!firebaseUser || !profile) return;
    await updateUserProfile(firebaseUser.uid, { [field]: !profile[field] });
    await refreshProfile();
  }

  async function onDeleteAccount() {
    const ok = confirm(
      'Удалить аккаунт и связанные данные (ваши календари, созданные записи, профиль)? Это действие нельзя отменить.'
    );
    if (!ok) return;
    const phrase = prompt('Введите УДАЛИТЬ заглавными буквами для подтверждения');
    if (phrase !== 'УДАЛИТЬ') {
      setErr('Удаление отменено');
      return;
    }
    setDeleting(true);
    setErr(null);
    try {
      await deleteAccount();
      setMsg('Аккаунт удалён');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось удалить аккаунт');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <h1>Настройки</h1>

      <div className="card">
        <div className="theme-toggle-row" style={{ marginBottom: 16 }}>
          <div className="theme-toggle-copy">
            <span className="theme-toggle-title">Оформление</span>
            <span className="theme-toggle-subtitle">
              {theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}
            </span>
          </div>
          <Switch on={theme === 'light'} onToggle={toggleTheme} label="Переключить светлую тему" />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{profile.displayName}</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {profile.role === 'master' ? 'Мастер' : 'Клиент'}
              {profile.email ? ` · ${profile.email}` : ''}
              {profile.phone ? ` · ${formatPhoneDisplay(profile.phone)}` : ''}
            </div>
            {isMaster && (
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                {subscriptionLabel(profile)} · <Link to="/subscription">управление</Link>
              </div>
            )}
          </div>
        </div>
        <Field label="Имя">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Напоминать за">
          <Select value={mins} onChange={(e) => setMins(e.target.value)}>
            <option value="15">15 минут</option>
            <option value="30">30 минут</option>
            <option value="60">1 час</option>
            <option value="120">2 часа</option>
            <option value="1440">1 день</option>
          </Select>
        </Field>
        {msg && <Alert type="success">{msg}</Alert>}
        {err && <Alert type="error">{err}</Alert>}
        <Button onClick={save} disabled={saving}>
          Сохранить
        </Button>
      </div>

      <div className="card">
        <h3>Уведомления</h3>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Напоминания о ваших записях — сервисные. Можно отключить в любой момент. Рекламные
          рассылки без отдельного согласия не отправляются.
        </p>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Email-напоминания</div>
          </div>
          <Switch on={profile.notifyEmail} onToggle={() => toggle('notifyEmail')} label="Email" />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Push</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {push.pushEnabled
                ? 'Активны'
                : push.permission === 'granted'
                  ? 'Разрешение есть, нажмите включить'
                  : 'Нужно разрешение'}
            </div>
          </div>
          <Switch on={profile.notifyPush} onToggle={() => toggle('notifyPush')} label="Push" />
        </div>
        {push.error && <Alert type="error">{push.error}</Alert>}
        <Button
          variant="secondary"
          onClick={async () => {
            if (await push.enablePush()) setMsg('Push включены. Токен сохранён.');
          }}
        >
          Включить push-уведомления
        </Button>
      </div>

      <div className="card">
        <h3>Документы и ПДн</h3>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Сервис — инструмент учёта для мастера. Услуги клиентам оказывает мастер, а не платформа.
        </p>
        <div className="btn-row" style={{ flexDirection: 'column' }}>
          <Link to="/privacy" className="btn btn-secondary" style={{ textAlign: 'center' }}>
            Политика персональных данных
          </Link>
          <Link to="/terms" className="btn btn-secondary" style={{ textAlign: 'center' }}>
            Пользовательское соглашение
          </Link>
        </div>
      </div>

      <div className="card">
        <h3>Удаление данных</h3>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Удаляются профиль, принадлежащие вам календари и созданные вами записи. Данные, которые
          другие мастера внесли у себя, не затрагиваются.
        </p>
        <Button variant="danger" disabled={deleting} onClick={onDeleteAccount}>
          {deleting ? 'Удаление…' : 'Удалить аккаунт и данные'}
        </Button>
      </div>

      <div className="card">
        <Button variant="danger" onClick={() => signOut()}>
          Выйти
        </Button>
      </div>
    </div>
  );
}
