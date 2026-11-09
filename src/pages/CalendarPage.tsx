import { useEffect, useMemo, useState } from 'react';
import { Plus, Calendar as CalIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { endOfMonth as dfEnd, startOfMonth as dfStart, addDays, startOfWeek } from 'date-fns';
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
import { WeekCalendar, DayHourGrid } from '../components/WeekCalendar';
import { AppointmentForm, type AppointmentFormValues } from '../components/AppointmentForm';
import { Empty, Sheet, Spinner, Alert, Button } from '../components/ui';
import { formatRu, toDateKey, format, calcEndTime } from '../lib/dates';
import { isSubscriptionActive } from '../lib/subscription';

export function CalendarPage() {
  const { profile, firebaseUser, isMaster, canUseApp } = useAuth();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [activeCalId, setActiveCalId] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [createPrefill, setCreatePrefill] = useState<{
    date: string;
    start: string;
    master: string;
  } | null>(null);

  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(new Date());
  const [daySheetOpen, setDaySheetOpen] = useState(false);

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

  const canCreate = useMemo(() => {
    if (!firebaseUser || !activeCal || !isMaster || !canUseApp) return false;
    return (
      activeCal.ownerId === firebaseUser.uid || activeCal.editors.includes(firebaseUser.uid)
    );
  }, [activeCal, firebaseUser, isMaster, canUseApp]);

  function canOpenCard(a: Appointment): boolean {
    if (!firebaseUser || !isMaster) return false;
    return a.createdBy === firebaseUser.uid;
  }

  // Load appointments for week ± buffer (and month when picker open)
  useEffect(() => {
    if (!activeCalId) {
      setAppointments([]);
      return;
    }
    // Load full month of weekAnchor so "выручка в месяц" is complete when switching weeks/months
    const monthStart = dfStart(weekAnchor);
    const monthEnd = dfEnd(weekAnchor);
    const from = format(monthStart, 'yyyy-MM-dd');
    const to = format(monthEnd, 'yyyy-MM-dd');
    return subscribeAppointments(activeCalId, from, to, setAppointments);
  }, [activeCalId, weekAnchor]);

  // Masters from appointments in current data
  const masters = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => {
      const n = (a.masterName || '').trim();
      if (n) set.add(n);
    });
    if (profile?.displayName && isMaster) set.add(profile.displayName);
    return Array.from(set).sort();
  }, [appointments, profile?.displayName, isMaster]);

  const stats = useMemo(() => {
    const uid = firebaseUser?.uid;
    const mine = (a: Appointment) => !uid || a.createdBy === uid;
    const selectedKey = toDateKey(selected);
    // Month of currently viewed week (weekAnchor)
    const monthPrefix = format(weekAnchor, 'yyyy-MM');
    const myCompleted = appointments.filter(
      (a) => a.status === 'completed' && mine(a)
    );
    const dayRevenue = myCompleted
      .filter((a) => a.date === selectedKey)
      .reduce((s, a) => s + (Number(a.price) || 0), 0);
    const monthRevenue = myCompleted
      .filter((a) => String(a.date || '').startsWith(monthPrefix))
      .reduce((s, a) => s + (Number(a.price) || 0), 0);
    const dayCount = appointments.filter(
      (a) => a.date === selectedKey && a.status !== 'cancelled' && mine(a)
    ).length;
    return { dayCount, dayRevenue, monthRevenue, monthPrefix };
  }, [appointments, firebaseUser?.uid, selected, weekAnchor]);

  // Month picker needs month range apts — reuse same list if overlaps; else separate
  const [monthApts, setMonthApts] = useState<Appointment[]>([]);
  useEffect(() => {
    if (!activeCalId || !monthPickerOpen) return;
    const from = format(dfStart(monthViewDate), 'yyyy-MM-dd');
    const to = format(dfEnd(monthViewDate), 'yyyy-MM-dd');
    return subscribeAppointments(activeCalId, from, to, setMonthApts);
  }, [activeCalId, monthViewDate, monthPickerOpen]);

  async function handleSave(values: AppointmentFormValues) {
    if (!firebaseUser || !activeCalId) return;
    if (editing && editing.createdBy !== firebaseUser.uid) {
      throw new Error('Нельзя редактировать чужую запись');
    }
    const endTime = values.endTime || calcEndTime(values.startTime, values.durationMinutes || 60);
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
    setCreatePrefill(null);
  }

  function openCreate(dateKey?: string, hour?: number, master?: string) {
    const start =
      hour != null ? `${String(hour).padStart(2, '0')}:00` : '10:00';
    setEditing(null);
    setCreatePrefill({
      date: dateKey || toDateKey(selected),
      start,
      master: master || profile?.displayName || '',
    });
    setSheetOpen(true);
  }

  function openApt(a: Appointment) {
    if (!canOpenCard(a)) return;
    setEditing(a);
    setCreatePrefill(null);
    setSheetOpen(true);
  }

  if (loading) return <Spinner />;

  if (isMaster && profile && !isSubscriptionActive(profile)) {
    return (
      <div>
        <h1>Календарь</h1>
        <Alert type="warn">Подписка истекла.</Alert>
        <Link to="/subscription" className="btn btn-primary" style={{ display: 'inline-flex' }}>
          Подписка
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
            <Empty title="Создайте календарь" />
            <Link to="/calendars" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              Создать
            </Link>
          </>
        ) : (
          <Empty title="Нет календарей" text="Попросите мастера открыть доступ" />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: 4 }}>Календарь</h1>
          {/* Date button opens month picker */}
          <button
            type="button"
            className="date-pill"
            onClick={() => {
              setMonthViewDate(selected);
              setMonthPickerOpen(true);
            }}
          >
            <CalIcon size={16} />
            <span>{formatRu(selected, 'd MMMM yyyy, EEEE')}</span>
          </button>
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
        <div className="stat-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="stat">
            <div className="num">{stats.dayCount}</div>
            <div className="lbl">мои записи (день)</div>
          </div>
          <div className="stat">
            <div className="num">{stats.dayRevenue.toLocaleString('ru-RU')}</div>
            <div className="lbl">₽ выручка за день</div>
          </div>
          <div className="stat">
            <div className="num">{stats.monthRevenue.toLocaleString('ru-RU')}</div>
            <div className="lbl">₽ выручка в месяц</div>
          </div>
        </div>
      )}

      <WeekCalendar
        weekAnchor={weekAnchor}
        onWeekChange={(d) => {
          setWeekAnchor(d);
        }}
        selected={selected}
        onSelectDay={(d) => {
          setSelected(d);
          setDaySheetOpen(true);
        }}
        appointments={appointments}
        masters={masters}
        onOpenAppointment={openApt}
        onCreateAt={
          canCreate
            ? (dateKey, hour, masterName) => openCreate(dateKey, hour, masterName)
            : undefined
        }
        canOpen={canOpenCard}
      />

      <p className="muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>
        Записи внутри сетки: время, мастер, описание. Клик по дню (шапка) — день 08:00–21:00.
        Клик по дате сверху — месяц. Чужие карточки не открываются.
      </p>

      {canCreate && (
        <button
          type="button"
          className="fab"
          onClick={() => openCreate()}
          aria-label="Новая запись"
        >
          <Plus size={28} />
        </button>
      )}

      {/* Month picker sheet */}
      <Sheet
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title="Выбор даты"
      >
        <MonthCalendar
          viewDate={monthViewDate}
          onViewDateChange={setMonthViewDate}
          selected={selected}
          onSelect={(d) => {
            setSelected(d);
            setWeekAnchor(d);
            setMonthPickerOpen(false);
          }}
          appointments={monthApts}
        />
        <Button
          variant="secondary"
          style={{ marginTop: 12 }}
          onClick={() => setMonthPickerOpen(false)}
        >
          Закрыть
        </Button>
      </Sheet>

      {/* Day hours 08–21 */}
      <Sheet open={daySheetOpen} onClose={() => setDaySheetOpen(false)} title="День">
        <DayHourGrid
          day={selected}
          appointments={appointments}
          onOpenAppointment={(a) => {
            setDaySheetOpen(false);
            openApt(a);
          }}
          onCreateAt={
            canCreate
              ? (hour) => {
                  setDaySheetOpen(false);
                  openCreate(toDateKey(selected), hour);
                }
              : undefined
          }
          canOpen={canOpenCard}
        />
      </Sheet>

      {/* Create / edit form */}
      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
          setCreatePrefill(null);
        }}
        title={editing ? 'Моя запись' : 'Новая запись'}
      >
        <AppointmentForm
          key={
            (editing?.id || 'new') +
            '-' +
            (createPrefill?.date || '') +
            (createPrefill?.start || '') +
            '-v120'
          }
          initialDate={createPrefill?.date || toDateKey(selected)}
          initialStartTime={createPrefill?.start}
          initialMasterName={createPrefill?.master}
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
        />
      </Sheet>
    </div>
  );
}
