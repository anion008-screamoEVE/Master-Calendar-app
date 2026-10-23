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
import { formatRu, toDateKey, format } from '../lib/dates';
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

  const canEdit = useMemo(() => {
    if (!firebaseUser || !activeCal) return false;
    if (activeCal.ownerId === firebaseUser.uid) return isMaster && canUseApp;
    return activeCal.editors.includes(firebaseUser.uid) && isMaster;
  }, [activeCal, firebaseUser, isMaster, canUseApp]);

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

  const stats = useMemo(() => {
    const today = toDateKey(new Date());
    const todayCount = appointments.filter((a) => a.date === today && a.status !== 'cancelled').length;
    const monthCount = appointments.filter((a) => a.status !== 'cancelled').length;
    const revenue = appointments
      .filter((a) => a.status === 'completed')
      .reduce((s, a) => s + (a.price || 0), 0);
    return { todayCount, monthCount, revenue };
  }, [appointments]);

  async function handleSave(values: AppointmentFormValues) {
    if (!firebaseUser || !activeCalId) return;
    const payload = {
      calendarId: activeCalId,
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      durationMinutes: values.durationMinutes,
      masterName: values.masterName,
      clientName: values.clientName,
      clientPhone: values.clientPhone,
      clientEmail: values.clientEmail,
      service: values.service,
      description: values.description,
      status: values.status,
      price: values.price,
      currency: 'RUB',
      color: values.color,
      location: values.location,
      notes: values.notes,
      createdBy: firebaseUser.uid,
      clientUid: null as string | null,
    };
    const mins = profile?.notifyMinutesBefore ?? 60;
    if (editing) await updateAppointment(editing.id, payload, mins);
    else await createAppointment(payload, mins);
    setSheetOpen(false);
    setEditing(null);
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
            <div className="lbl">сегодня</div>
          </div>
          <div className="stat">
            <div className="num">{stats.monthCount}</div>
            <div className="lbl">в месяце</div>
          </div>
          <div className="stat">
            <div className="num">{stats.revenue.toLocaleString('ru-RU')}</div>
            <div className="lbl">₽ завершено</div>
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
        {dayApts.length === 0 ? (
          <Empty emoji="☕" title="Записей нет" text={canEdit ? 'Нажмите +, чтобы добавить' : undefined} />
        ) : (
          dayApts.map((a) => (
            <AppointmentCard
              key={a.id}
              apt={a}
              onClick={() => {
                setEditing(a);
                setSheetOpen(true);
              }}
            />
          ))
        )}
      </div>

      {canEdit && (
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
        title={editing ? (canEdit ? 'Запись v1.0.3' : 'Просмотр') : 'Новая запись v1.0.3'}
      >
        <AppointmentForm
          key={(editing?.id || 'new') + '-' + dayKey + '-v103'}
          initialDate={dayKey}
          existing={editing}
          onSubmit={handleSave}
          onDelete={
            canEdit && editing
              ? async () => {
                  await deleteAppointment(editing.id);
                  setSheetOpen(false);
                  setEditing(null);
                }
              : undefined
          }
          readOnly={!canEdit}
        />
      </Sheet>
    </div>
  );
}
