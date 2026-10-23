import {
  monthMatrix,
  formatRu,
  nextMonth,
  prevMonth,
  isSameDay,
  isSameMonth,
  toDateKey,
  WEEKDAYS_SHORT,
} from '../lib/dates';
import type { Appointment } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  viewDate: Date;
  onViewDateChange: (d: Date) => void;
  selected: Date;
  onSelect: (d: Date) => void;
  appointments: Appointment[];
}

export function MonthCalendar({
  viewDate,
  onViewDateChange,
  selected,
  onSelect,
  appointments,
}: Props) {
  const days = monthMatrix(viewDate);
  const byDate = appointments.reduce<Record<string, Appointment[]>>((acc, a) => {
    (acc[a.date] ||= []).push(a);
    return acc;
  }, {});
  const today = new Date();

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="cal-header">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onViewDateChange(prevMonth(viewDate))}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="cal-title">{formatRu(viewDate, 'LLLL yyyy')}</div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onViewDateChange(nextMonth(viewDate))}
          aria-label="Следующий месяц"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="weekdays">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="days-grid">
        {days.map((day) => {
          const key = toDateKey(day);
          const list = byDate[key] || [];
          const outside = !isSameMonth(day, viewDate);
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selected);
          const colors = [...new Set(list.map((a) => a.color))].slice(0, 4);
          return (
            <button
              key={key}
              type="button"
              className={`day-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${
                isSelected ? 'selected' : ''
              }`}
              onClick={() => onSelect(day)}
            >
              <span className="day-num">{day.getDate()}</span>
              {colors.length > 0 && (
                <span className="day-dots">
                  {colors.map((c) => (
                    <span key={c} className="dot" style={{ background: c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
