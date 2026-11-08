import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
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
  const [targetType, setTargetType] = useState<'email' | 'phone' | 'telegram'>('email');
  const [permission, setPermission] = useState<'edit' | 'view'>('view');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [telegramShareUrl, setTelegramShareUrl] = useState<string | null>(null);

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
  }, [firebaseUser?.uid, firebaseUser?.email, firebaseUser?.phoneNumber, profile?.email, profile?.phone]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setTelegramShareUrl(null);
    if (!firebaseUser || !profile || !calId) return;
    const cal = calendars.find((c) => c.id === calId);
    if (!cal) return;
    if (!target.trim()) {
      setError('Укажите получателя');
      return;
    }

    setSending(true);
    try {
      const recipient = targetType === 'email'
        ? { email: target.trim() }
        : targetType === 'phone'
          ? { phone: target.trim() }
          : { telegram: target.trim() };
      await shareCalendar(cal.id, cal.name, firebaseUser.uid, profile.displayName, recipient, permission);
      const url = `${window.location.origin}/`;
      const message = `Вам открыли ${permission === 'edit' ? 'совместный доступ' : 'доступ для просмотра'} к календарю «${cal.name}». Откройте приложение, войдите в аккаунт ${targetType === 'telegram' ? 'через тот же Telegram' : 'и нажмите «Доступ» → «Принять'}.`;
      setTelegramShareUrl(targetType === 'telegram' ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}` : null);
      setMsg(targetType === 'telegram'
        ? 'Приглашение создано для Telegram-аккаунта. Получатель должен открыть приложение через тот же Telegram и принять приглашение во вкладке «Доступ».'
        : 'Приглашение создано. Получатель должен войти с указанным email/телефоном и принять его во вкладке «Доступ».');
      setTarget('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания приглашения');
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
      setInviteError(err instanceof Error ? err.message : 'Не удалось принять приглашение');
    } finally {
      setActingId(null);
    }
  }

  async function onReject(id: string) {
    setActingId(id);
    try { await rejectShare(id); }
    catch (err) { setInviteError(err instanceof Error ? err.message : 'Не удалось отклонить приглашение'); }
    finally { setActingId(null); }
  }

  if (loading) return <Spinner />;
  const sharedWithMe = allCals.filter((c) => c.ownerId !== firebaseUser?.uid);

  return (
    <div>
      <h1>Доступ</h1>
      <p className="muted">Приглашения по email, телефону или Telegram (@username / ID).</p>
      {msg && <Alert type="success">{msg}</Alert>}
      {inviteError && <Alert type="error">{inviteError}</Alert>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Вам открыли доступ</h3>
        {invites.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
            Нет входящих приглашений. Telegram-приглашение появится здесь, если вы вошли именно через тот Telegram-аккаунт, на который его отправили.
          </p>
        ) : invites.map((inv) => (
          <div key={inv.id} className="list-item" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{inv.calendarName}</div>
              <div className="muted" style={{ fontSize: '.8rem' }}>
                от {inv.fromName || 'мастер'} · {inv.permission === 'edit' ? 'совместное редактирование' : 'только просмотр'}
              </div>
            </div>
            <div className="btn-row" style={{ width: 'auto' }}>
              <Button size="sm" variant="secondary" disabled={actingId === inv.id} onClick={() => onReject(inv.id)}>Отклонить</Button>
              <Button size="sm" disabled={actingId === inv.id} onClick={() => onAccept(inv.id)}>{actingId === inv.id ? '…' : 'Принять'}</Button>
            </div>
          </div>
        ))}
      </div>

      {sharedWithMe.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Календари с доступом</h3>
          {sharedWithMe.map((c) => (
            <div key={c.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>{c.editors.includes(firebaseUser!.uid) ? 'Совместное редактирование' : 'Только просмотр'}</div>
              </div>
              <Link to="/" className="btn btn-secondary btn-sm">Открыть</Link>
            </div>
          ))}
        </div>
      )}

      {isMaster && (
        <div className="card">
          <h3>Пригласить в мой календарь</h3>
          {error && <Alert type="error">{error}</Alert>}
          {calendars.length === 0 ? <Empty title="Сначала создайте календарь" /> : (
            <form onSubmit={sendInvite}>
              <Field label="Календарь">
                <Select value={calId} onChange={(e) => setCalId(e.target.value)}>
                  {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Права">
                <Select value={permission} onChange={(e) => setPermission(e.target.value as 'edit' | 'view')}>
                  <option value="view">Только просмотр</option>
                  <option value="edit">Совместное редактирование</option>
                </Select>
              </Field>
              <Field label="Способ приглашения">
                <Select value={targetType} onChange={(e) => { setTargetType(e.target.value as typeof targetType); setTarget(''); setTelegramShareUrl(null); }}>
                  <option value="email">Email</option>
                  <option value="phone">Телефон</option>
                  <option value="telegram">Telegram (@username или ID)</option>
                </Select>
              </Field>
              <Field label={targetType === 'email' ? 'Email получателя' : targetType === 'phone' ? 'Телефон получателя' : 'Telegram username или ID'} hint={targetType === 'telegram' ? 'Получатель должен уже войти в приложение через Telegram хотя бы один раз.' : undefined}>
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={targetType === 'email' ? 'client@mail.ru' : targetType === 'phone' ? '+79991234567' : '@username или числовой ID'}
                  autoComplete={targetType === 'email' ? 'email' : targetType === 'phone' ? 'tel' : 'off'}
                />
              </Field>
              {targetType === 'telegram' && (
                <p className="muted" style={{ fontSize: '.78rem' }}>
                  Telegram не разрешает боту писать человеку, пока тот сам не открыл бота. Приглашение появится в приложении получателя во вкладке «Доступ». После создания можно отправить ему сообщение через Telegram.
                </p>
              )}
              <Button type="submit" disabled={sending}>{sending ? 'Создаю приглашение…' : 'Создать приглашение'}</Button>
              {telegramShareUrl && (
                <a className="tg-share-button" href={telegramShareUrl} target="_blank" rel="noreferrer">
                  <Send size={18} /> Отправить уведомление через Telegram
                </a>
              )}
            </form>
          )}
        </div>
      )}

      {isMaster && calendars.map((c) => c.editors.length || c.viewers.length ? (
        <div key={c.id} className="card">
          <h3>{c.name} — участники</h3>
          {c.editors.map((uid) => (
            <div key={uid} className="list-item">
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: '.75rem' }}>Редактор</div><code>{uid.slice(0, 16)}…</code></div>
              <Button size="sm" variant="danger" onClick={() => removeCalendarMember(c.id, uid, 'edit')}>Убрать</Button>
            </div>
          ))}
          {c.viewers.map((uid) => (
            <div key={uid} className="list-item">
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: '.75rem' }}>Просмотр</div><code>{uid.slice(0, 16)}…</code></div>
              <Button size="sm" variant="danger" onClick={() => removeCalendarMember(c.id, uid, 'view')}>Убрать</Button>
            </div>
          ))}
        </div>
      ) : null)}
    </div>
  );
}
