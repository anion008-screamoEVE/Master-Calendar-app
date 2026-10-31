import type { Appointment } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';

export function AppointmentCard({
  apt,
  onClick,
  showPrice,
  clickable,
}: {
  apt: Appointment;
  onClick?: () => void;
  /** Price only for owner of the appointment */
  showPrice?: boolean;
  clickable?: boolean;
}) {
  const content = (
    <>
      <div className="apt-color" style={{ background: apt.color }} />
      <div className="apt-body">
        <div className="apt-time">
          {apt.startTime}
          {apt.endTime ? ` – ${apt.endTime}` : ''}
          {showPrice && apt.price > 0 && (
            <span style={{ marginLeft: 8 }}>· {apt.price.toLocaleString('ru-RU')} ₽</span>
          )}
        </div>
        <div className="apt-title">
          {apt.service || 'Услуга'} — {apt.clientName || 'Клиент'}
        </div>
        <div className="apt-meta">
          {apt.masterName && <span>👤 {apt.masterName}</span>}
          <span className="badge badge-status" style={{ background: STATUS_COLORS[apt.status] }}>
            {STATUS_LABELS[apt.status]}
          </span>
        </div>
      </div>
    </>
  );

  if (clickable && onClick) {
    return (
      <button type="button" className="apt-card" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="apt-card" style={{ cursor: 'default' }}>{content}</div>;
}
