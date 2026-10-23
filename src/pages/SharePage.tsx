import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeCalendarsForUser,
  shareCalendar,
  subscribePendingShares,
  acceptShare,
  rejectShare,
  removeCalendarMember,
} from '../lib/api';
import type { Calendar, ShareInvite } from '../types';
import { Alert, Button, Empty, Field, Input, Select, Spinner } from '../components/ui';

export function SharePage() {
  const { firebaseUser, profile, isMaster } = useAuth();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [invites, setInvites] = useState<ShareInvite[]>([]);
  const [calId, setCalId] = useState('');
  const [target, setTarget] = useState('');
  const [targetType, setTargetType] = useState<'email' | 'phone'>('email');
  const [permission, setPermission] = useState<'edit' | 'view'>('view');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeCalendarsForUser(firebaseUser.uid, (list) => {
      setCalendars(list.filter((c) => c.ownerId === firebaseUser.uid));
      setLoading(false);
      setCalId((prev) => prev || list.find((c) => c.ownerId === firebaseUser.uid)?.id || '');
    });
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!profile) return;
    return subscribePendingShares(profile.email, profile.phone, setInvites);
  }, [profile?.email, profile?.phone]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!firebaseUser || !profile || !calId) return;
    const cal = calendars.find((c) => c.id === calId);
    if (!cal) return;
    if (!target.trim()) {
      setError('Укажите email или телефон');
      return;
    }
    setSending(true);
    try {
      await shareCalendar(
        cal.id,
        cal.name,
        firebaseUser.uid,
        profile.displayName,
        targetType === 'email' ? { email: target.trim().toLowerCase() } : { phone: target.trim() },
        permission
      );
      setMsg('Приглашение создано');
      setTarget('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <h1>Доступ</h1>
      <p className="muted">Делитесь календарями</p>

      {invites.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Вам открыли доступ</h3>
          {invites.map((inv) => (
            <div key={inv.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{inv.calendarName}</div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  от {inv.fromName} · {inv.permission === 'edit' ? 'редактирование' : 'просмотр'}
                </div>
              </div>
              <div className="btn-row" style={{ width: 'auto' }}>
                <Button size="sm" variant="secondary" onClick={() => rejectShare(inv.id)}>
                  Отклонить
                </Button>
                <Button size="sm" onClick={() => firebaseUser && acceptShare(inv.id, firebaseUser.uid)}>
                  Принять
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isMaster && (
        <div className="card">
          <h3>Пригласить</h3>
          {error && <Alert type="error">{error}</Alert>}
          {msg && <Alert type="success">{msg}</Alert>}
          {calendars.length === 0 ? (
            <Empty title="Сначала создайте календарь" />
          ) : (
            <form onSubmit={sendInvite}>
              <Field label="Календарь">
                <Select value={calId} onChange={(e) => setCalId(e.target.value)}>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Права">
                <Select value={permission} onChange={(e) => setPermission(e.target.value as 'edit' | 'view')}>
                  <option value="view">Только просмотр</option>
                  <option value="edit">Совместное редактирование</option>
                </Select>
              </Field>
              <Field label="Пригласить по">
                <Select value={targetType} onChange={(e) => setTargetType(e.target.value as 'email' | 'phone')}>
                  <option value="email">Email</option>
                  <option value="phone">Телефон</option>
                </Select>
              </Field>
              <Field label={targetType === 'email' ? 'Email' : 'Телефон'}>
                <Input value={target} onChange={(e) => setTarget(e.target.value)} />
              </Field>
              <Button type="submit" disabled={sending}>
                {sending ? 'Отправка…' : 'Отправить'}
              </Button>
            </form>
          )}
        </div>
      )}

      {isMaster &&
        calendars.map((c) =>
          c.editors.length || c.viewers.length ? (
            <div key={c.id} className="card">
              <h3>{c.name}</h3>
              {c.editors.map((uid) => (
                <div key={uid} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      Редактор
                    </div>
                    <code style={{ fontSize: '0.8rem' }}>{uid.slice(0, 12)}…</code>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => removeCalendarMember(c.id, uid, 'edit')}>
                    Убрать
                  </Button>
                </div>
              ))}
              {c.viewers.map((uid) => (
                <div key={uid} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      Просмотр
                    </div>
                    <code style={{ fontSize: '0.8rem' }}>{uid.slice(0, 12)}…</code>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => removeCalendarMember(c.id, uid, 'view')}>
                    Убрать
                  </Button>
                </div>
              ))}
            </div>
          ) : null
        )}
    </div>
  );
}
