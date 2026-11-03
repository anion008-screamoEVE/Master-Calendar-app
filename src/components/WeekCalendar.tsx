import { useMemo } from 'react';
import { addDays, startOfWeek, isSameDay, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Appointment } from '../types';
import { toDateKey, formatRu } from '../lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 21 * 60;
const HOUR_COUNT = 13;
const ROW_HEIGHT = 64;

function minutesOf(time: string | undefined, fallback: number): number {
  if (!time) return fallback;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return fallback;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function durationOf(a: Appointment): number {
  const start = minutesOf(a.startTime, DAY_START_MIN);
  let end = a.endTime ? minutesOf(a.endTime, start + 60) : start + (a.durationMinutes || 60);
  if (end <= start) end += 24 * 60;
  return Math.max(15, end - start);
}

function buildLanes(list: Appointment[]) {
  const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const laneEnds: number[] = [];
  const items = sorted.map((apt) => {
    const start = minutesOf(apt.startTime, DAY_START_MIN);
    const end = start + durationOf(apt);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    return { apt, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return items.map((item) => ({ ...item, laneCount }));
}

function Timeline({
  day,
  appointments,
  onOpenAppointment,
  onCreateAt,
  canOpen,
  compact = false,
}: {
  day: Date;
  appointments: Appointment[];
  onOpenAppointment: (a: Appointment) => void;
  onCreateAt?: (hour: number) => void;
  canOpen: (a: Appointment) => boolean;
  compact?: boolean;
}) {
  const key = toDateKey(day);
  const items = useMemo(() => buildLanes(appointments.filter((a) => a.date === key)), [appointments, key]);
  const rowHeight = compact ? ROW_HEIGHT : 58;
  const totalHeight = HOUR_COUNT * rowHeight;

  return (
    <div className={`timeline ${compact ? 'timeline-compact' : ''}`} style={{ height: totalHeight }}>
      <div className="timeline-slots">
        {Array.from({ length: HOUR_COUNT }, (_, i) => {
          const hour = i + 8;
          return (
            <button
              key={hour}
              type="button"
              className="timeline-slot"
              style={{ top: i * rowHeight, height: rowHeight }}
              aria-label={`Создать запись ${hour}:00`}
              onClick={() => onCreateAt?.(hour)}
            />
          );
        })}
      </div>
      {items.map(({ apt, lane, laneCount }) => {
        const start = minutesOf(apt.startTime, DAY_START_MIN);
        const end = start + durationOf(apt);
        const visibleStart = Math.max(DAY_START_MIN, start);
        const visibleEnd = Math.min(DAY_END_MIN, end);
        if (visibleEnd <= visibleStart) return null;

        const top = ((visibleStart - DAY_START_MIN) / 60) * rowHeight;
        const height = Math.max(34, ((visibleEnd - visibleStart) / 60) * rowHeight);
        const gap = 4;
        const width = `calc(${100 / laneCount}% - ${laneCount > 1 ? gap : 0}px)`;
        const left = `calc(${(lane * 100) / laneCount}% + ${lane > 0 ? gap / 2 : 0}px)`;
        return (
          <button
            key={apt.id}
            type="button"
            className="timeline-event"
            style={{ top, height, left, width, background: apt.color || '#6366f1', cursor: canOpen(apt) ? 'pointer' : 'default' }}
            onClick={() => canOpen(apt) && onOpenAppointment(apt)}
            title={`${apt.startTime}–${apt.endTime} · ${apt.masterName} · ${apt.description || apt.service}`}
          >
            <span className="timeline-event-time">{apt.startTime}–{apt.endTime}</span>
            <span className="timeline-event-master">{apt.masterName || 'Мастер'}</span>
            <span className="timeline-event-desc">{apt.description || apt.service || apt.clientName}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WeekCalendar({
  weekAnchor,
  onWeekChange,
  selected,
  onSelectDay,
  appointments,
  masters: _masters,
  onOpenAppointment,
  onCreateAt,
  canOpen,
}: {
  weekAnchor: Date;
  onWeekChange: (d: Date) => void;
  selected: Date;
  onSelectDay: (d: Date) => void;
  appointments: Appointment[];
  masters: string[];
  onOpenAppointment: (a: Appointment) => void;
  onCreateAt?: (dateKey: string, hour: number, masterName: string) => void;
  canOpen: (a: Appointment) => boolean;
}) {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]);

  return (
    <div className="week-board card">
      <div className="week-toolbar">
        <button type="button" className="icon-btn" aria-label="Предыдущая неделя" onClick={() => onWeekChange(addDays(weekAnchor, -7))}>
          <ChevronLeft size={18} />
        </button>
        <div className="week-toolbar-title">
          <span className="week-toolbar-eyebrow">РАСПИСАНИЕ</span>
          <strong>{formatRu(days[0], 'd MMMM')} – {formatRu(days[6], 'd MMMM yyyy')}</strong>
        </div>
        <button type="button" className="icon-btn" aria-label="Следующая неделя" onClick={() => onWeekChange(addDays(weekAnchor, 7))}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="week-board-scroll">
        <div className="week-board-grid">
          <div className="week-time-head">ВРЕМЯ</div>
          {days.map((day) => (
            <button
              type="button"
              key={toDateKey(day)}
              className={`week-day-head ${isSameDay(day, new Date()) ? 'is-today' : ''} ${isSameDay(day, selected) ? 'is-selected' : ''}`}
              onClick={() => onSelectDay(day)}
            >
              <span>{format(day, 'EEEE', { locale: ru })}</span>
              <strong>{format(day, 'd')}</strong>
              <small>{format(day, 'MMM', { locale: ru })}</small>
            </button>
          ))}
          <div className="week-time-axis">
            {Array.from({ length: HOUR_COUNT }, (_, i) => (
              <div className="week-hour-label" key={i}>{String(i + 8).padStart(2, '0')}:00</div>
            ))}
          </div>
          {days.map((day) => (
            <Timeline
              key={toDateKey(day)}
              day={day}
              appointments={appointments}
              onOpenAppointment={onOpenAppointment}
              onCreateAt={(hour) => onCreateAt?.(toDateKey(day), hour, '')}
              canOpen={canOpen}
              compact
            />
          ))}
        </div>
      </div>
      <div className="week-board-footer">
        <span className="week-legend-dot" /> Цвет блока соответствует цвету записи
        <span className="week-legend-sep">·</span> Блок растягивается от начала до окончания
      </div>
    </div>
  );
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
  return (
    <div className="day-timeline-wrap">
      <div className="day-timeline-heading">
        <span className="day-timeline-date">{formatRu(day, 'EEEE, d MMMM yyyy')}</span>
        <span className="day-timeline-hours">08:00 — 21:00</span>
      </div>
      <div className="day-timeline-layout">
        <div className="day-time-axis">
          {Array.from({ length: HOUR_COUNT }, (_, i) => (
            <div className="day-hour-label" key={i}>{String(i + 8).padStart(2, '0')}:00</div>
          ))}
        </div>
        <Timeline
          day={day}
          appointments={appointments}
          onOpenAppointment={onOpenAppointment}
          onCreateAt={onCreateAt}
          canOpen={canOpen}
        />
      </div>
    </div>
  );
}
