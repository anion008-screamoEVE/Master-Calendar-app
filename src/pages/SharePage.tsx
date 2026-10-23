import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [allCals, setAllCals] = useState<Calendar[]>([]);
  const [invites, setInvites] = useState<ShareInvite[]>([]);
  const [calId, setCalId] = useState('');
  const [target, setTarget] = useState('');
  const [targetType, setTargetType] = useState<'email' | 'phone'>('email');
  const [permission, setPermission] = useState<'edit' | 'view'>('view');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeCalendarsForUser(firebaseUser.uid, (list) => {
      setAllCals(list);
      const owned = list.filter((c) => c.ownerId === firebaseUser.uid);
      setCalendars(owned);
      setLoading(false);
      setCalId((prev) => prev || owned[0]?.id || '');
    });
  }, [firebaseUser?.uid]);

  // Listen for pending invites for THIS user (email / phone / uid)
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return subscribePendingShares(
      {
        uid: firebaseUser.uid,
        email: profile.email || firebaseUser.email,
        phone: profile.phone || firebaseUser.phoneNumber,
      },
      setInvites
    );
  }, [
    firebaseUser?.uid,
    firebaseUser?.email,
    firebaseUser?.phoneNumber,
    profile?.email,
    profile?.phone,
  ]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!firebaseUser || !profile || !calId) return;
    const cal = calendars.find((c) => c.id === calId);
    if (!cal) return;
    if (!target.trim()) {
      setError('Укажите email или телефон получателя');
      return;
    }
    setSending(true);
    try {
      await shareCalendar(
        cal.id,
        cal.name,
        firebaseUser.uid,
        profile.displayName,
        targetType === 'email'
          ? { email: target.trim() }
          : { phone: target.trim() },
        permission
      );
      setMsg(
        'Приглашение создано. Получатель должен открыть «Доступ» → «Принять» (войти тем же email/телефоном).'
      );
      setTarget('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSending(false);
    }
  }

  async function onAccept(id: string) {
    if (!firebaseUser || !profile) return;
    setInviteError(null);
    setActingId(id);
    try {
      await acceptShare(id, firebaseUser.uid, {
        email: profile.email || firebaseUser.email,
        phone: profile.phone || firebaseUser.phoneNumber,
      });
      setMsg('Доступ принят. Календарь появится во вкладке «Календарь».');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Не удалось принять');
    } finally {
      setActingId(null);
    }
  }

  async function onReject(id: string) {
    setActingId(id);
    try {
      await rejectShare(id);
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <Spinner />;

  const sharedWithMe = allCals.filter((c) => c.ownerId !== firebaseUser?.uid);

  return (
    <div>
      <h1>Доступ</h1>
      <p className="muted">
        Приглашения и совместные календари. Получатель должен войти с тем же email или телефоном,
        на который отправили приглашение.
      </p>

      {msg && <Alert type="success">{msg}</Alert>}
      {inviteError && <Alert type="error">{inviteError}</Alert>}

      {/* Incoming invites — for Master AND Client */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Вам открыли доступ</h3>
        {invites.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Нет входящих приглашений. Если мастер уже отправил share — проверьте, что вы вошли
            под тем же email/телефоном, и что в Firebase опубликованы новые Rules.
          </p>
        ) : (
          invites.map((inv) => (
            <div key={inv.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{inv.calendarName}</div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  от {inv.fromName || 'мастер'} ·{' '}
                  {inv.permission === 'edit' ? 'редактирование' : 'только просмотр'}
                </div>
              </div>
              <div className="btn-row" style={{ width: 'auto' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actingId === inv.id}
                  onClick={() => onReject(inv.id)}
                >
                  Отклонить
                </Button>
                <Button
                  size="sm"
                  disabled={actingId === inv.id}
                  onClick={() => onAccept(inv.id)}
                >
                  {actingId === inv.id ? '…' : 'Принять'}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {sharedWithMe.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Календари с доступом</h3>
          {sharedWithMe.map((c) => (
            <div key={c.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {c.editors.includes(firebaseUser!.uid)
                    ? 'Совместное редактирование'
                    : 'Только просмотр'}
                </div>
              </div>
              <Link to="/" className="btn btn-secondary btn-sm">
                Открыть
              </Link>
            </div>
          ))}
        </div>
      )}

      {isMaster && (
        <div className="card">
          <h3>Пригласить</h3>
          {error && <Alert type="error">{error}</Alert>}
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
                <Select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'edit' | 'view')}
                >
                  <option value="view">Клиент / только просмотр</option>
                  <option value="edit">Мастер / совместное редактирование</option>
                </Select>
              </Field>
              <Field label="Пригласить по">
                <Select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as 'email' | 'phone')}
                >
                  <option value="email">Email</option>
                  <option value="phone">Телефон (+7…)</option>
                </Select>
              </Field>
              <Field label={targetType === 'email' ? 'Email получателя' : 'Телефон получателя'}>
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={
                    targetType === 'email' ? 'client@mail.ru' : '+79991234567'
                  }
                  autoComplete={targetType === 'email' ? 'email' : 'tel'}
                />
              </Field>
              <p className="muted" style={{ fontSize: '0.75rem', marginTop: -8 }}>
                Получатель должен уже зарегистрироваться в приложении (или зарегистрируется
                позже) с этим email/телефоном, зайти в «Доступ» и нажать «Принять».
              </p>
              <Button type="submit" disabled={sending}>
                {sending ? 'Отправка…' : 'Отправить приглашение'}
              </Button>
            </form>
          )}
        </div>
      )}

      {isMaster &&
        calendars.map((c) =>
          c.editors.length || c.viewers.length ? (
            <div key={c.id} className="card">
              <h3>{c.name} — участники</h3>
              {c.editors.map((id) => (
                <div key={id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      Редактор
                    </div>
                    <code style={{ fontSize: '0.8rem' }}>{id.slice(0, 16)}…</code>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeCalendarMember(c.id, id, 'edit')}
                  >
                    Убрать
                  </Button>
                </div>
              ))}
              {c.viewers.map((id) => (
                <div key={id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      Просмотр
                    </div>
                    <code style={{ fontSize: '0.8rem' }}>{id.slice(0, 16)}…</code>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeCalendarMember(c.id, id, 'view')}
                  >
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
