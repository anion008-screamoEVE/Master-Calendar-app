import type { Appointment } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';

export function AppointmentCard({
  apt,
  onClick,
}: {
  apt: Appointment;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="apt-card" onClick={onClick}>
      <div className="apt-color" style={{ background: apt.color }} />
      <div className="apt-body">
        <div className="apt-time">
          {apt.startTime} – {apt.endTime}
          {apt.durationMinutes > 0 && (
            <span style={{ marginLeft: 8 }}>· {apt.durationMinutes} мин</span>
          )}
          {apt.price > 0 && (
            <span style={{ marginLeft: 8 }}>· {apt.price.toLocaleString('ru-RU')} ₽</span>
          )}
        </div>
        <div className="apt-title">
          {apt.service || 'Услуга'} — {apt.clientName || 'Клиент'}
        </div>
        <div className="apt-meta">
          {apt.masterName && <span>👤 {apt.masterName}</span>}
          {apt.location && <span>📍 {apt.location}</span>}
          <span className="badge badge-status" style={{ background: STATUS_COLORS[apt.status] }}>
            {STATUS_LABELS[apt.status]}
          </span>
        </div>
      </div>
    </button>
  );
}
