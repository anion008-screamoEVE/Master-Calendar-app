import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  parseISO,
  setHours,
  setMinutes,
} from 'date-fns';
import { ru } from 'date-fns/locale';

export function formatRu(date: Date | number, pattern: string): string {
  return format(date, pattern, { locale: ru });
}

export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function monthMatrix(viewDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function nextMonth(d: Date) {
  return addMonths(d, 1);
}

export function prevMonth(d: Date) {
  return subMonths(d, 1);
}

export { isSameDay, isSameMonth, parseISO, setHours, setMinutes, format };

export function combineDateTime(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const base = parseISO(dateStr);
  return setMinutes(setHours(base, h || 0), m || 0);
}

/** Окончание = начало + N минут (N без верхнего лимита, можно 0). */
export function calcEndTime(startTime: string, durationMinutes: number): string {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const parts = String(startTime).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const total = ((h % 24) * 60 + (m % 60) + mins) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

/** Разница end - start в минутах. Если end ≤ start - считаем через полночь. */
export function durationFromRange(startTime: string, endTime: string): number {
  const sp = String(startTime).split(':');
  const ep = String(endTime).split(':');
  const sh = Number(sp[0]) || 0;
  const sm = Number(sp[1]) || 0;
  const eh = Number(ep[0]) || 0;
  const em = Number(ep[1]) || 0;
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end < start) end += 24 * 60;
  if (end === start) return 1;
  return Math.max(0, end - start);
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
