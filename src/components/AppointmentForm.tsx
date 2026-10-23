import { useState } from 'react';
import type { Appointment, AppointmentStatus } from '../types';
import { CARD_COLORS, STATUS_LABELS } from '../types';
import { Field, Input, Select, Textarea, Button, ColorPicker } from './ui';
import { calcEndTime, durationFromRange } from '../lib/dates';
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

/** Подсказки — не лимит */
const DURATION_HINTS = [120, 180, 240, 300, 360, 480];

/** Нормализация ввода времени: 9:5 → 09:05, 930 → 09:30 */
function normalizeTimeInput(raw: string): string | null {
  const s = raw.trim().replace('.', ':').replace(',', ':');
  if (!s) return null;

  // HH:mm or H:mm
  let m = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    return null;
  }

  // только цифры: 930, 0930, 9
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length <= 4) {
    const h = Number(digits.slice(0, digits.length - 2));
    const min = Number(digits.slice(-2));
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  if (digits.length === 1 || digits.length === 2) {
    const h = Number(digits);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

function isTimeLike(raw: string): boolean {
  return normalizeTimeInput(raw) !== null || /^\d{0,2}:?\d{0,2}$/.test(raw.trim());
}

const defaultValues = (date: string, masterName: string): AppointmentFormValues => ({
  date,
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: 60,
  masterName,
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  service: '',
  description: '',
  status: 'scheduled',
  price: 0,
  color: CARD_COLORS[0],
  location: '',
  notes: '',
});

function fromApt(a: Appointment): AppointmentFormValues {
  const start = a.startTime || '10:00';
  const duration = a.durationMinutes > 0 ? a.durationMinutes : durationFromRange(start, a.endTime || start);
  const end = a.endTime || calcEndTime(start, duration || 60);
  return {
    date: a.date,
    startTime: start,
    endTime: end,
    durationMinutes: duration || durationFromRange(start, end),
    masterName: a.masterName,
    clientName: a.clientName,
    clientPhone: a.clientPhone,
    clientEmail: a.clientEmail,
    service: a.service,
    description: a.description,
    status: a.status,
    price: a.price,
    color: a.color,
    location: a.location,
    notes: a.notes,
  };
}

interface Props {
  initialDate: string;
  existing?: Appointment | null;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  readOnly?: boolean;
}

/**
 * Длительность и окончание — независимый свободный ввод.
 * Меняете длительность → пересчитывается окончание.
 * Меняете окончание → пересчитывается длительность.
 * При сохранении используется введённое окончание как есть (не затирается).
 */
export function AppointmentForm({
  initialDate,
  existing,
  onSubmit,
  onDelete,
  readOnly,
}: Props) {
  const { profile } = useAuth();
  const initial = existing ? fromApt(existing) : defaultValues(initialDate, profile?.displayName || '');

  const [values, setValues] = useState<AppointmentFormValues>(initial);
  // Строки ввода — без принуждения, пока пользователь печатает
  const [durationText, setDurationText] = useState(String(initial.durationMinutes));
  const [startText, setStartText] = useState(initial.startTime);
  const [endText, setEndText] = useState(initial.endTime);
  /** Что правили последним — чтобы при blur/save не спорили поля */
  const [lastEdited, setLastEdited] = useState<'duration' | 'end' | 'start'>('duration');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof AppointmentFormValues>(key: K, v: AppointmentFormValues[K]) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  /** Длительность: любое положительное число, без max */
  function applyDurationFromText(raw: string, syncEnd: boolean) {
    const cleaned = raw.replace(',', '.').replace(/[^\d.]/g, '');
    setDurationText(raw);
    const n = Math.floor(Number(cleaned));
    if (!Number.isFinite(n) || cleaned === '' || n < 0) {
      return;
    }
    // 0 допускается в поле при наборе; при save подставим минимум 1 если нужно
    setValues((s) => {
      const next = { ...s, durationMinutes: n };
      if (syncEnd && n >= 0) {
        const start = normalizeTimeInput(startText) || s.startTime;
        next.endTime = calcEndTime(start, Math.max(n, 0));
        setEndText(next.endTime);
      }
      return next;
    });
  }

  function applyStartFromText(raw: string) {
    setStartText(raw);
    setLastEdited('start');
    const norm = normalizeTimeInput(raw);
    if (!norm) return;
    setValues((s) => {
      const next = { ...s, startTime: norm };
      if (lastEdited === 'end' || endText) {
        // сохраняем окончание, пересчитываем длительность
        const end = normalizeTimeInput(endText) || s.endTime;
        next.endTime = end;
        next.durationMinutes = durationFromRange(norm, end);
        setDurationText(String(next.durationMinutes));
      } else {
        next.endTime = calcEndTime(norm, s.durationMinutes || 0);
        setEndText(next.endTime);
      }
      return next;
    });
  }

  function applyEndFromText(raw: string) {
    setEndText(raw);
    setLastEdited('end');
    const norm = normalizeTimeInput(raw);
    if (!norm) return;
    const start = normalizeTimeInput(startText) || values.startTime;
    const dur = durationFromRange(start, norm);
    setValues((s) => ({
      ...s,
      startTime: start,
      endTime: norm,
      durationMinutes: dur,
    }));
    setDurationText(String(dur));
  }

  function pickDurationHint(m: number) {
    setLastEdited('duration');
    setDurationText(String(m));
    const start = normalizeTimeInput(startText) || values.startTime;
    const end = calcEndTime(start, m);
    setEndText(end);
    setValues((s) => ({
      ...s,
      startTime: start,
      durationMinutes: m,
      endTime: end,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);

    const start = normalizeTimeInput(startText);
    if (!start) {
      setError('Укажите время начала, например 10:00 или 9:30');
      return;
    }

    let end = normalizeTimeInput(endText);
    let duration = Math.floor(Number(String(durationText).replace(',', '.').replace(/[^\d.]/g, '')));

    // Приоритет: если последним правили окончание — оно главное
    if (lastEdited === 'end' && end) {
      duration = durationFromRange(start, end);
    } else if (lastEdited === 'duration' && Number.isFinite(duration) && duration >= 0) {
      // длительность главная — окончание из неё (если end не введён валидно, тоже)
      if (duration === 0) duration = 1;
      end = calcEndTime(start, duration);
    } else if (end) {
      duration = durationFromRange(start, end);
    } else if (Number.isFinite(duration) && duration > 0) {
      end = calcEndTime(start, duration);
    } else {
      setError('Укажите длительность (минуты) или время окончания');
      return;
    }

    if (!end) {
      setError('Укажите время окончания, например 11:45');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      duration = durationFromRange(start, end);
    }

    if (!values.clientName.trim()) {
      setError('Укажите имя клиента');
      return;
    }
    if (!values.service.trim()) {
      setError('Укажите вид услуги');
      return;
    }

    const payload: AppointmentFormValues = {
      ...values,
      startTime: start,
      endTime: end,
      durationMinutes: duration,
    };

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Дата">
          <Input
            type="date"
            value={values.date}
            onChange={(e) => setField('date', e.target.value)}
            disabled={readOnly}
            required
          />
        </Field>
        <Field label="Начало" hint="ЧЧ:ММ, любой ввод">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="10:00"
            value={startText}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || isTimeLike(v) || v.length < startText.length) {
                applyStartFromText(v);
              } else if (/^[\d:.\s]*$/.test(v)) {
                setStartText(v);
              }
            }}
            onBlur={() => {
              const n = normalizeTimeInput(startText);
              if (n) {
                setStartText(n);
                applyStartFromText(n);
              }
            }}
            disabled={readOnly}
            autoComplete="off"
            required
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Длительность (мин)" hint="Любое число, без ограничений">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="75"
            value={durationText}
            onChange={(e) => {
              const v = e.target.value;
              // разрешаем любые цифры, пусто, без max
              if (v === '' || /^\d*$/.test(v)) {
                setLastEdited('duration');
                applyDurationFromText(v, true);
              }
            }}
            onBlur={() => {
              if (durationText === '') return;
              const n = Math.floor(Number(durationText));
              if (Number.isFinite(n) && n >= 0) {
                setLastEdited('duration');
                applyDurationFromText(String(n), true);
              }
            }}
            disabled={readOnly}
            autoComplete="off"
          />
        </Field>
        <Field label="Окончание" hint="ЧЧ:ММ вручную, без ограничений">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="11:45"
            value={endText}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || isTimeLike(v) || v.length < endText.length) {
                applyEndFromText(v);
              } else if (/^[\d:.\s]*$/.test(v)) {
                setEndText(v);
                setLastEdited('end');
              }
            }}
            onBlur={() => {
              const n = normalizeTimeInput(endText);
              if (n) {
                setEndText(n);
                applyEndFromText(n);
              }
            }}
            disabled={readOnly}
            autoComplete="off"
          />
        </Field>
      </div>

      {!readOnly && (
        <div className="chip-row" style={{ marginBottom: 14, marginTop: -6 }}>
          {DURATION_HINTS.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              onClick={() => pickDurationHint(m)}
              title={`${m} мин`}
            >
              {m >= 60 ? `${m / 60} ч` : `${m} м`}
            </button>
          ))}
        </div>
      )}

      <Field label="Клиент">
        <Input
          value={values.clientName}
          onChange={(e) => setField('clientName', e.target.value)}
          placeholder="Имя клиента"
          disabled={readOnly}
          required
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Телефон клиента">
          <Input
            value={values.clientPhone}
            onChange={(e) => setField('clientPhone', e.target.value)}
            placeholder="+7..."
            disabled={readOnly}
          />
        </Field>
        <Field label="Email клиента">
          <Input
            type="email"
            value={values.clientEmail}
            onChange={(e) => setField('clientEmail', e.target.value)}
            placeholder="email@..."
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Мастер">
        <Input
          value={values.masterName}
          onChange={(e) => setField('masterName', e.target.value)}
          disabled={readOnly}
        />
      </Field>

      <Field label="Вид услуги">
        <Input
          value={values.service}
          onChange={(e) => setField('service', e.target.value)}
          placeholder="Стрижка, маникюр..."
          disabled={readOnly}
          required
        />
      </Field>

      <Field label="Описание">
        <Textarea
          value={values.description}
          onChange={(e) => setField('description', e.target.value)}
          placeholder="Детали записи..."
          disabled={readOnly}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Статус">
          <Select
            value={values.status}
            onChange={(e) => setField('status', e.target.value as AppointmentStatus)}
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
            value={values.price === 0 ? '' : String(values.price)}
            onChange={(e) => {
              const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
              setField('price', v === '' ? 0 : Number(v) || 0);
            }}
            placeholder="0"
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Адрес / место">
        <Input
          value={values.location}
          onChange={(e) => setField('location', e.target.value)}
          placeholder="Студия, кабинет..."
          disabled={readOnly}
        />
      </Field>

      <Field label="Внутренние заметки">
        <Textarea
          value={values.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Только для мастеров"
          disabled={readOnly}
        />
      </Field>

      <Field label="Цвет карточки">
        <ColorPicker
          value={values.color}
          onChange={(c) => !readOnly && setField('color', c)}
          colors={CARD_COLORS}
        />
      </Field>

      {!readOnly && (
        <div className="btn-row" style={{ marginTop: 8 }}>
          {existing && onDelete && (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!confirm('Удалить запись?')) return;
                setSaving(true);
                try {
                  await onDelete();
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
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
