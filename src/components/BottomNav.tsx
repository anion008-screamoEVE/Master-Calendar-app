import { NavLink } from 'react-router-dom';
import { CalendarDays, LayoutGrid, Settings, CreditCard, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function BottomNav() {
  const { isMaster } = useAuth();
  const items = [
    { to: '/', icon: CalendarDays, label: 'Календарь', end: true },
    ...(isMaster
      ? [
          { to: '/calendars', icon: LayoutGrid, label: 'Календари', end: false },
          { to: '/share', icon: Users, label: 'Доступ', end: false },
          { to: '/subscription', icon: CreditCard, label: 'Подписка', end: false },
        ]
      : []),
    { to: '/settings', icon: Settings, label: 'Ещё', end: false },
  ];

  return (
    <nav className="bottom-nav" aria-label="Главное меню">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <item.icon />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
