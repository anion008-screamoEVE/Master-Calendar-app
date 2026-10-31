import { useMemo } from 'react';
import {
  addDays,
  startOfWeek,
  isSameDay,
  format,
  parseISO,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Appointment } from '../types';
import { toDateKey, formatRu } from '../lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const HOUR_START = 8;
const HOUR_END = 21; // exclusive end for rows: 8..20 = slots until 21:00
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function timeToHour(t: string): number {
  const h = Number(String(t).split(':')[0]) || 0;
  return h;
}

export function WeekCalendar({
  weekAnchor,
  onWeekChange,
  selected,
  onSelectDay,
  appointments,
  masters,
  onOpenAppointment,
  onCreateAt,
  canOpen,
}: {
  weekAnchor: Date;
  onWeekChange: (d: Date) => void;
  selected: Date;
  onSelectDay: (d: Date) => void;
  appointments: Appointment[];
  /** Unique master names for columns (optional multi-master). If empty — single column «Все». */
  masters: string[];
  onOpenAppointment: (a: Appointment) => void;
  onCreateAt?: (dateKey: string, hour: number, masterName: string) => void;
  canOpen: (a: Appointment) => boolean;
}) {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()]
  );

  const masterCols = masters.length > 0 ? masters : ['Все'];

  // Group apts by dateKey
  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      (m[a.date] ||= []).push(a);
    }
    return m;
  }, [appointments]);

  function aptsFor(day: Date, hour: number, master: string): Appointment[] {
    const key = toDateKey(day);
    const list = byDay[key] || [];
    return list.filter((a) => {
      const h = timeToHour(a.startTime);
      if (h !== hour) return false;
      if (master === 'Все') return true;
      return (a.masterName || '').trim() === master || (!a.masterName && master === masters[0]);
    });
  }

  return (
    <div className="week-wrap card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="cal-header" style={{ padding: '10px 12px' }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Предыдущая неделя"
          onClick={() => onWeekChange(addDays(weekAnchor, -7))}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="cal-title" style={{ fontSize: '0.95rem' }}>
          {formatRu(days[0], 'd MMM')} – {formatRu(days[6], 'd MMM yyyy')}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Следующая неделя"
          onClick={() => onWeekChange(addDays(weekAnchor, 7))}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="week-scroll">
        <table className="week-table">
          <thead>
            <tr>
              <th className="week-th-time">Время</th>
              {days.map((d) => {
                const sel = isSameDay(d, selected);
                const today = isSameDay(d, new Date());
                return (
                  <th
                    key={toDateKey(d)}
                    className={`week-th-day ${sel ? 'selected' : ''} ${today ? 'today' : ''}`}
                    colSpan={masterCols.length}
                  >
                    <button type="button" className="week-day-btn" onClick={() => onSelectDay(d)}>
                      <span className="week-day-name">{format(d, 'EEEEEE', { locale: ru })}</span>
                      <span className="week-day-num">{format(d, 'd')}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
            {masterCols.length > 1 && (
              <tr>
                <th className="week-th-time" />
                {days.map((d) =>
                  masterCols.map((m) => (
                    <th key={toDateKey(d) + m} className="week-th-master">
                      {m}
                    </th>
                  ))
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour}>
                <td className="week-td-time">{pad2(hour)}:00</td>
                {days.map((d) =>
                  masterCols.map((master) => {
                    const list = aptsFor(d, hour, master);
                    const dk = toDateKey(d);
                    return (
                      <td
                        key={dk + master + hour}
                        className="week-td-cell"
                        onClick={() => {
                          if (list.length === 0 && onCreateAt) {
                            onCreateAt(dk, hour, master === 'Все' ? '' : master);
                          }
                        }}
                      >
                        {list.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="week-event"
                            style={{
                              background: a.color || '#6366f1',
                              cursor: canOpen(a) ? 'pointer' : 'default',
                              opacity: canOpen(a) ? 1 : 0.85,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canOpen(a)) onOpenAppointment(a);
                            }}
                            title={`${a.startTime}-${a.endTime} ${a.masterName} ${a.description || a.service}`}
                          >
                            <div className="week-event-time">
                              {a.startTime}–{a.endTime}
                            </div>
                            <div className="week-event-master">{a.masterName || '—'}</div>
                            <div className="week-event-desc">
                              {a.description || a.service || a.clientName}
                            </div>
                          </button>
                        ))}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function DayHourGrid({
  day,
  appointments,
  onOpenAppointment,
  onCreateAt,
  canOpen,
}: {
  day: Date;
  appointments: Appointment[];
  onOpenAppointment: (a: Appointment) => void;
  onCreateAt?: (hour: number) => void;
  canOpen: (a: Appointment) => boolean;
}) {
  const key = toDateKey(day);
  const list = appointments.filter((a) => a.date === key);

  return (
    <div className="day-hour-grid">
      <h3 style={{ margin: '0 0 10px' }}>{formatRu(day, 'd MMMM yyyy, EEEE')}</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Часы 08:00–21:00. Нажмите на пустой час, чтобы создать запись.
      </p>
      {HOURS.map((hour) => {
        const slot = list.filter((a) => timeToHour(a.startTime) === hour);
        return (
          <div key={hour} className="day-hour-row">
            <div className="day-hour-label">{pad2(hour)}:00</div>
            <div
              className="day-hour-slots"
              onClick={() => {
                if (slot.length === 0 && onCreateAt) onCreateAt(hour);
              }}
            >
              {slot.length === 0 && <span className="muted">свободно</span>}
              {slot.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="week-event"
                  style={{
                    background: a.color || '#6366f1',
                    cursor: canOpen(a) ? 'pointer' : 'default',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canOpen(a)) onOpenAppointment(a);
                  }}
                >
                  <div className="week-event-time">
                    {a.startTime}–{a.endTime}
                  </div>
                  <div className="week-event-master">{a.masterName}</div>
                  <div className="week-event-desc">{a.description || a.service}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// silence unused
void parseISO;
