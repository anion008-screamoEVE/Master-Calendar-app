import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { endOfMonth as dfEnd, startOfMonth as dfStart } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeCalendarsForUser,
  subscribeAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from '../lib/api';
import type { Appointment, Calendar } from '../types';
import { MonthCalendar } from '../components/MonthCalendar';
import { AppointmentCard } from '../components/AppointmentCard';
import { AppointmentForm, type AppointmentFormValues } from '../components/AppointmentForm';
import { Empty, Sheet, Spinner, Alert } from '../components/ui';
import { formatRu, toDateKey, format, calcEndTime } from '../lib/dates';
import { isSubscriptionActive } from '../lib/subscription';

export function CalendarPage() {
  const { profile, firebaseUser, isMaster, canUseApp } = useAuth();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [activeCalId, setActiveCalId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeCalendarsForUser(firebaseUser.uid, (list) => {
      setCalendars(list);
      setLoading(false);
      setActiveCalId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return (list.find((c) => c.isPrimary) || list[0])?.id || null;
      });
    });
  }, [firebaseUser?.uid]);

  const activeCal = calendars.find((c) => c.id === activeCalId) || null;

  /** Can create/edit calendar structure */
  const canCreate = useMemo(() => {
    if (!firebaseUser || !activeCal || !isMaster || !canUseApp) return false;
    return (
      activeCal.ownerId === firebaseUser.uid || activeCal.editors.includes(firebaseUser.uid)
    );
  }, [activeCal, firebaseUser, isMaster, canUseApp]);

  /** Open card only if this user owns the appointment (createdBy) */
  function canOpenCard(a: Appointment): boolean {
    if (!firebaseUser || !isMaster) return false;
    return a.createdBy === firebaseUser.uid;
  }

  useEffect(() => {
    if (!activeCalId) {
      setAppointments([]);
      return;
    }
    const from = format(dfStart(viewDate), 'yyyy-MM-dd');
    const to = format(dfEnd(viewDate), 'yyyy-MM-dd');
    return subscribeAppointments(activeCalId, from, to, setAppointments);
  }, [activeCalId, viewDate]);

  const dayKey = toDateKey(selected);
  const dayApts = appointments
    .filter((a) => a.date === dayKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  /** Revenue only from MY completed appointments */
  const stats = useMemo(() => {
    const uid = firebaseUser?.uid;
    const mine = (a: Appointment) => !uid || a.createdBy === uid;
    const today = toDateKey(new Date());
    const todayCount = appointments.filter(
      (a) => a.date === today && a.status !== 'cancelled' && mine(a)
    ).length;
    const monthCount = appointments.filter((a) => a.status !== 'cancelled' && mine(a)).length;
    const revenue = appointments
      .filter((a) => a.status === 'completed' && mine(a))
      .reduce((s, a) => s + (a.price || 0), 0);
    return { todayCount, monthCount, revenue };
  }, [appointments, firebaseUser?.uid]);

  async function handleSave(values: AppointmentFormValues) {
    if (!firebaseUser || !activeCalId) return;
    // Only owner can edit existing; cannot edit others' cards
    if (editing && editing.createdBy !== firebaseUser.uid) {
      throw new Error('Нельзя редактировать чужую запись');
    }

    const endTime =
      values.endTime ||
      calcEndTime(values.startTime, values.durationMinutes || 60);

    const payload = {
      calendarId: activeCalId,
      date: values.date,
      startTime: values.startTime,
      endTime,
      durationMinutes: values.durationMinutes || 60,
      masterName: values.masterName || profile?.displayName || '',
      clientName: values.clientName,
      clientPhone: values.clientPhone || '',
      clientEmail: '',
      service: values.service,
      description: values.description || '',
      status: values.status,
      price: values.price || 0,
      currency: 'RUB',
      color: values.color,
      location: '',
      notes: '',
      createdBy: editing?.createdBy || firebaseUser.uid,
      clientUid: null as string | null,
    };

    const mins = profile?.notifyMinutesBefore ?? 60;
    if (editing) await updateAppointment(editing.id, payload, mins);
    else await createAppointment(payload, mins);
    setSheetOpen(false);
    setEditing(null);
  }

  function tryOpen(a: Appointment) {
    if (!canOpenCard(a)) return;
    setEditing(a);
    setSheetOpen(true);
  }

  if (loading) return <Spinner />;

  if (isMaster && profile && !isSubscriptionActive(profile)) {
    return (
      <div>
        <h1>Календарь</h1>
        <Alert type="warn">Подписка истекла. Продлите доступ.</Alert>
        <Link to="/subscription" className="btn btn-primary" style={{ display: 'inline-flex' }}>
          Оформить подписку — 200 ₽/мес
        </Link>
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <div>
        <h1>Календарь</h1>
        {isMaster ? (
          <>
            <Empty emoji="✨" title="Создайте первый календарь" text="Раздел «Календари»." />
            <Link to="/calendars" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              Создать календарь
            </Link>
          </>
        ) : (
          <Empty emoji="👀" title="Нет доступных календарей" text="Попросите мастера поделиться." />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <div>
          <h1 style={{ marginBottom: 2 }}>Календарь</h1>
          <p className="muted" style={{ margin: 0 }}>
            {formatRu(selected, 'd MMMM yyyy, EEEE')}
          </p>
        </div>
      </div>

      {calendars.length > 1 && (
        <div className="cal-switch">
          {calendars.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cal-chip ${c.id === activeCalId ? 'active' : ''}`}
              onClick={() => setActiveCalId(c.id)}
            >
              <span className="dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isMaster && (
        <div className="stat-row">
          <div className="stat">
            <div className="num">{stats.todayCount}</div>
            <div className="lbl">мои сегодня</div>
          </div>
          <div className="stat">
            <div className="num">{stats.monthCount}</div>
            <div className="lbl">мои в месяце</div>
          </div>
          <div className="stat">
            <div className="num">{stats.revenue.toLocaleString('ru-RU')}</div>
            <div className="lbl">₽ моя выручка</div>
          </div>
        </div>
      )}

      <MonthCalendar
        viewDate={viewDate}
        onViewDateChange={setViewDate}
        selected={selected}
        onSelect={setSelected}
        appointments={appointments}
      />

      <div className="apt-list">
        <h3 style={{ marginTop: 4 }}>Записи на {formatRu(selected, 'd MMMM')}</h3>
        {!isMaster && (
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
            Карточки только для просмотра в списке (без открытия деталей).
          </p>
        )}
        {isMaster && (
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
            Открыть и редактировать можно только свои записи. Чужие — только строка в списке.
            Выручка считает только ваши завершённые записи.
          </p>
        )}
        {dayApts.length === 0 ? (
          <Empty
            emoji="☕"
            title="Записей нет"
            text={canCreate ? 'Нажмите +, чтобы добавить' : undefined}
          />
        ) : (
          dayApts.map((a) => {
            const mine = canOpenCard(a);
            return (
              <AppointmentCard
                key={a.id}
                apt={a}
                showPrice={mine}
                clickable={mine}
                onClick={mine ? () => tryOpen(a) : undefined}
              />
            );
          })
        )}
      </div>

      {canCreate && (
        <button
          type="button"
          className="fab"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
          aria-label="Новая запись"
        >
          <Plus size={28} />
        </button>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Моя запись' : 'Новая запись'}
      >
        <AppointmentForm
          key={(editing?.id || 'new') + '-' + dayKey + '-v110'}
          initialDate={dayKey}
          existing={editing}
          onSubmit={handleSave}
          onDelete={
            editing && canOpenCard(editing)
              ? async () => {
                  await deleteAppointment(editing.id);
                  setSheetOpen(false);
                  setEditing(null);
                }
              : undefined
          }
          readOnly={false}
        />
      </Sheet>
    </div>
  );
}
