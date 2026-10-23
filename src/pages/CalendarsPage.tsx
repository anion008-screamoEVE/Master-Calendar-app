import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeCalendarsForUser,
  createCalendar,
  updateCalendar,
  deleteCalendar,
} from '../lib/api';
import type { Calendar } from '../types';
import { CARD_COLORS } from '../types';
import { Alert, Button, ColorPicker, Empty, Field, Input, Sheet, Spinner, Textarea } from '../components/ui';
import { isSubscriptionActive } from '../lib/subscription';

export function CalendarsPage() {
  const { firebaseUser, profile, canUseApp } = useAuth();
  const [list, setList] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Calendar | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeCalendarsForUser(firebaseUser.uid, (cals) => {
      setList(cals);
      setLoading(false);
    });
  }, [firebaseUser?.uid]);

  const owned = list.filter((c) => c.ownerId === firebaseUser?.uid);
  const shared = list.filter((c) => c.ownerId !== firebaseUser?.uid);

  async function save() {
    if (!firebaseUser) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateCalendar(editing.id, {
          name: name.trim(),
          description: description.trim(),
          color,
        });
      } else {
        await createCalendar(firebaseUser.uid, {
          name: name.trim(),
          description: description.trim(),
          color,
          isPrimary: owned.length === 0,
        });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  if (profile && !isSubscriptionActive(profile) && profile.role === 'master') {
    return (
      <div>
        <h1>Календари</h1>
        <Alert type="warn">Нужна активная подписка мастера.</Alert>
        <Link to="/subscription" className="btn btn-primary" style={{ display: 'inline-flex' }}>
          Подписка
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <div>
          <h1>Календари</h1>
          <p className="muted" style={{ margin: 0 }}>
            Несколько направлений
          </p>
        </div>
        {canUseApp && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setEditing(null);
              setName('');
              setDescription('');
              setColor(CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]);
              setError(null);
              setOpen(true);
            }}
            aria-label="Добавить"
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      <h3>Мои</h3>
      {owned.length === 0 ? (
        <Empty title="Пока нет календарей" text="Нажмите + чтобы создать" />
      ) : (
        owned.map((c) => (
          <div key={c.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setEditing(c);
                setName(c.name);
                setDescription(c.description);
                setColor(c.color);
                setError(null);
                setOpen(true);
              }}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'inherit',
                padding: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: c.color,
                    display: 'inline-block',
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {c.name} {c.isPrimary && <span className="badge">основной</span>}
                  </div>
                  {c.description && <div className="muted">{c.description}</div>}
                </div>
              </div>
            </button>
            {!c.isPrimary && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  if (confirm(`Удалить «${c.name}»?`)) deleteCalendar(c.id);
                }}
                aria-label="Удалить"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))
      )}

      {shared.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Доступные мне</h3>
          {shared.map((c) => (
            <div key={c.id} className="card">
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {c.editors.includes(firebaseUser!.uid) ? 'Редактирование' : 'Просмотр'}
              </div>
            </div>
          ))}
        </>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? 'Календарь' : 'Новый календарь'}>
        {error && <Alert type="error">{error}</Alert>}
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Маникюр / Барбершоп" />
        </Field>
        <Field label="Описание">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} colors={CARD_COLORS} />
        </Field>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </Sheet>
    </div>
  );
}
