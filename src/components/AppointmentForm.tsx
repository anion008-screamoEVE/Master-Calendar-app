import { useState } from 'react';
import type { Appointment, AppointmentStatus } from '../types';
import { CARD_COLORS, STATUS_LABELS } from '../types';
import { Field, Input, Select, Textarea, Button, ColorPicker } from './ui';
import { useAuth } from '../contexts/AuthContext';

export type AppointmentFormValues = {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  masterName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  service: string;
  description: string;
  status: AppointmentStatus;
  price: number;
  color: string;
  location: string;
  notes: string;
};

/** Quick chips only — NOT a dropdown limit */
const HINTS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360];

function pad2(n: number) {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

function parseTime(raw: string): string | null {
  const s = String(raw || '')
    .trim()
    .replace(/\./g, ':')
    .replace(/,/g, ':');
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return pad2(h) + ':' + pad2(min);
    }
    return null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 3 || d.length === 4) {
    const h = Number(d.slice(0, d.length - 2));
    const min = Number(d.slice(-2));
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return pad2(h) + ':' + pad2(min);
    }
  }
  if (d.length === 1 || d.length === 2) {
    const h = Number(d);
    if (h >= 0 && h <= 23) return pad2(h) + ':00';
  }
  return null;
}

function toMin(t: string): number {
  const p = String(t).split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

function fromMin(total: number): string {
  const x = ((Math.floor(total) % 1440) + 1440) % 1440;
  return pad2(Math.floor(x / 60)) + ':' + pad2(x % 60);
}

function addMin(start: string, mins: number): string {
  return fromMin(toMin(start) + Math.max(0, Math.floor(Number(mins) || 0)));
}

function diffMin(start: string, end: string): number {
  let a = toMin(start);
  let b = toMin(end);
  if (b < a) b += 1440;
  const d = b - a;
  return d < 1 ? 1 : d;
}

interface Props {
  initialDate: string;
  existing?: Appointment | null;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  readOnly?: boolean;
}

/**
 * FORM_VERSION = 1.0.3
 * Duration = free text input (NO <select>, NO dropdown 15/30/60).
 * End time = free text input (NO type="time" clock picker required).
 * If the live site still shows a dropdown "15 мин…180 мин" —
 * GitHub still has the OLD AppointmentForm.tsx. Replace the whole file.
 */
export function AppointmentForm({
  initialDate,
  existing,
  onSubmit,
  onDelete,
  readOnly,
}: Props) {
  const { profile } = useAuth();

  const start0 = existing?.startTime || '10:00';
  const end0 = existing?.endTime || addMin(start0, existing?.durationMinutes || 60);
  const dur0 =
    existing && existing.durationMinutes > 0
      ? existing.durationMinutes
      : diffMin(start0, end0);

  const [date, setDate] = useState(existing?.date || initialDate);
  const [startText, setStartText] = useState(start0);
  const [endText, setEndText] = useState(end0);
  const [durText, setDurText] = useState(String(dur0));
  const [last, setLast] = useState<'start' | 'end' | 'dur'>('dur');

  const [masterName, setMasterName] = useState(
    existing?.masterName || profile?.displayName || ''
  );
  const [clientName, setClientName] = useState(existing?.clientName || '');
  const [clientPhone, setClientPhone] = useState(existing?.clientPhone || '');
  const [clientEmail, setClientEmail] = useState(existing?.clientEmail || '');
  const [service, setService] = useState(existing?.service || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [status, setStatus] = useState<AppointmentStatus>(existing?.status || 'scheduled');
  const [price, setPrice] = useState(existing?.price ? String(existing.price) : '');
  const [color, setColor] = useState(existing?.color || CARD_COLORS[0]);
  const [location, setLocation] = useState(existing?.location || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onStart(v: string) {
    setStartText(v);
    setLast('start');
    const s = parseTime(v);
    if (!s) return;
    if (last === 'end') {
      const e = parseTime(endText);
      if (e) setDurText(String(diffMin(s, e)));
    } else {
      const d = Math.floor(Number(durText));
      if (Number.isFinite(d) && d >= 0) setEndText(addMin(s, d));
    }
  }

  function onEnd(v: string) {
    setEndText(v);
    setLast('end');
    const e = parseTime(v);
    const s = parseTime(startText);
    if (e && s) setDurText(String(diffMin(s, e)));
  }

  function onDur(v: string) {
    // only digits, any length — no max
    if (v !== '' && !/^\d*$/.test(v)) return;
    setDurText(v);
    setLast('dur');
    const s = parseTime(startText);
    const d = Math.floor(Number(v));
    if (s && v !== '' && Number.isFinite(d) && d >= 0) {
      setEndText(addMin(s, d));
    }
  }

  function applyHint(mins: number) {
    setLast('dur');
    setDurText(String(mins));
    const s = parseTime(startText) || '10:00';
    setStartText(s);
    setEndText(addMin(s, mins));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);

    const start = parseTime(startText);
    if (!start) {
      setError('Начало: введите время, например 10:00');
      return;
    }

    let end = parseTime(endText);
    let duration = Math.floor(Number(durText));

    if (last === 'end' && end) {
      duration = diffMin(start, end);
    } else if (last === 'dur' && Number.isFinite(duration) && duration >= 0) {
      if (duration < 1) duration = 1;
      end = addMin(start, duration);
    } else if (end) {
      duration = diffMin(start, end);
    } else if (Number.isFinite(duration) && duration > 0) {
      end = addMin(start, duration);
    } else {
      setError('Укажите окончание (11:30) или длительность в минутах');
      return;
    }

    if (!end) {
      setError('Окончание: введите время, например 11:45');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      duration = diffMin(start, end);
    }
    if (!clientName.trim()) {
      setError('Укажите имя клиента');
      return;
    }
    if (!service.trim()) {
      setError('Укажите вид услуги');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        date,
        startTime: start,
        endTime: end,
        durationMinutes: duration,
        masterName,
        clientName: clientName.trim(),
        clientPhone,
        clientEmail,
        service: service.trim(),
        description,
        status,
        price: Number(String(price).replace(',', '.')) || 0,
        color,
        location,
        notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} data-form-version="1.0.3">
      {/* VISIBLE MARKER — if you do NOT see this green box, old form is still deployed */}
      <div
        style={{
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid rgba(34, 197, 94, 0.45)',
          color: '#bbf7d0',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: '0.8rem',
          fontWeight: 600,
          marginBottom: 14,
          lineHeight: 1.4,
        }}
      >
        Форма v1.0.3 активна. Длительность — любое число минут (не список). Окончание —
        ввод вручную.
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Дата">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={readOnly}
            required
          />
        </Field>
        <Field label="Начало" hint="Напр. 10:00 или 9:30">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="10:00"
            value={startText}
            onChange={(e) => onStart(e.target.value)}
            onBlur={() => {
              const t = parseTime(startText);
              if (t) {
                setStartText(t);
                onStart(t);
              }
            }}
            disabled={readOnly}
            autoComplete="off"
          />
        </Field>
      </div>

      {/*
        CRITICAL: duration must be <input type="text"> — NEVER <select>.
        End must be type="text" — free typing.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Длительность (мин)" hint="Свободно: 75, 200, 480…">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="60"
            value={durText}
            onChange={(e) => onDur(e.target.value)}
            disabled={readOnly}
            autoComplete="off"
          />
        </Field>
        <Field label="Окончание" hint="Свободно: 11:45, 14:00…">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="11:00"
            value={endText}
            onChange={(e) => onEnd(e.target.value)}
            onBlur={() => {
              const t = parseTime(endText);
              if (t) {
                setEndText(t);
                onEnd(t);
              }
            }}
            disabled={readOnly}
            autoComplete="off"
          />
        </Field>
      </div>

      {!readOnly && (
        <div className="chip-row" style={{ marginBottom: 14, marginTop: -4 }}>
          {HINTS.map((m) => (
            <button key={m} type="button" className="chip" onClick={() => applyHint(m)}>
              {m >= 60 ? m / 60 + ' ч' : m + ' м'}
            </button>
          ))}
        </div>
      )}

      <Field label="Клиент">
        <Input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Имя клиента"
          disabled={readOnly}
          required
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Телефон клиента">
          <Input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="+7..."
            disabled={readOnly}
          />
        </Field>
        <Field label="Email клиента">
          <Input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="email@..."
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Мастер">
        <Input value={masterName} onChange={(e) => setMasterName(e.target.value)} disabled={readOnly} />
      </Field>

      <Field label="Вид услуги">
        <Input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Стрижка, маникюр..."
          disabled={readOnly}
          required
        />
      </Field>

      <Field label="Описание">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Статус">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            disabled={readOnly}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Цена, ₽">
          <Input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Адрес / место">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={readOnly} />
      </Field>

      <Field label="Внутренние заметки">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
      </Field>

      <Field label="Цвет карточки">
        <ColorPicker value={color} onChange={(c) => !readOnly && setColor(c)} colors={CARD_COLORS} />
      </Field>

      {!readOnly && (
        <div className="btn-row" style={{ marginTop: 8 }}>
          {existing && onDelete && (
            <Button
              type="button"
              variant="danger"
              disabled={saving}
              onClick={async () => {
                if (!confirm('Удалить запись?')) return;
                setSaving(true);
                try {
                  await onDelete();
                } finally {
                  setSaving(false);
                }
              }}
            >
              Удалить
            </Button>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : existing ? 'Сохранить' : 'Создать запись'}
          </Button>
        </div>
      )}
    </form>
  );
}
