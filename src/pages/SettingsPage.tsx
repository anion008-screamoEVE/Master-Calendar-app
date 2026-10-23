import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateUserProfile } from '../lib/api';
import { usePush } from '../hooks/usePush';
import { Alert, Button, Field, Input, Select, Switch } from '../components/ui';
import { subscriptionLabel } from '../lib/subscription';
import { formatPhoneDisplay } from '../lib/phone';

export function SettingsPage() {
  const { profile, firebaseUser, signOut, isMaster, refreshProfile } = useAuth();
  const push = usePush();
  const [name, setName] = useState(profile?.displayName || '');
  const [mins, setMins] = useState(String(profile?.notifyMinutesBefore ?? 60));
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!profile || !firebaseUser) return null;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await updateUserProfile(firebaseUser!.uid, {
        displayName: name.trim() || profile!.displayName,
        notifyMinutesBefore: Number(mins) || 60,
      });
      await refreshProfile();
      setMsg('Сохранено');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(field: 'notifyEmail' | 'notifyPush') {
    if (!firebaseUser || !profile) return;
    await updateUserProfile(firebaseUser.uid, { [field]: !profile[field] });
    await refreshProfile();
  }

  return (
    <div>
      <h1>Настройки</h1>
      <div className="card">
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
        <Button onClick={save} disabled={saving}>
          Сохранить
        </Button>
      </div>

      <div className="card">
        <h3>Уведомления</h3>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Email</div>
          </div>
          <Switch on={profile.notifyEmail} onToggle={() => toggle('notifyEmail')} label="Email" />
        </div>
        <div className="list-item">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Push</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {push.permission === 'granted' ? 'Разрешены' : 'Нужно разрешение'}
            </div>
          </div>
          <Switch on={profile.notifyPush} onToggle={() => toggle('notifyPush')} label="Push" />
        </div>
        {push.error && <Alert type="error">{push.error}</Alert>}
        <Button
          variant="secondary"
          onClick={async () => {
            if (await push.enablePush()) setMsg('Push включены');
          }}
        >
          Включить push
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
