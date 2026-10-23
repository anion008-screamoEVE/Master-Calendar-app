export type UserRole = 'master' | 'client';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'none';
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface AppUser {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string | null;
  phone: string | null;
  photoURL: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: number;
  trialStartedAt: number;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyMinutesBefore: number;
  createdAt: number;
  fcmTokens?: string[];
}

export interface Calendar {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  color: string;
  isPrimary: boolean;
  editors: string[];
  viewers: string[];
  pendingEditors: string[];
  pendingViewers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Appointment {
  id: string;
  calendarId: string;
  date: string;
  startTime: string;
  endTime: string;
  masterName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  service: string;
  description: string;
  status: AppointmentStatus;
  price: number;
  currency: string;
  color: string;
  durationMinutes: number;
  location: string;
  notes: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  notifyAt: number | null;
  notified: boolean;
  clientUid: string | null;
}

export interface ShareInvite {
  id: string;
  calendarId: string;
  calendarName: string;
  fromUid: string;
  fromName: string;
  toEmail: string | null;
  toPhone: string | null;
  toUid?: string | null;
  permission: 'edit' | 'view';
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Запланирована',
  confirmed: 'Подтверждена',
  in_progress: 'В процессе',
  completed: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Не явился',
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: '#6366f1',
  confirmed: '#22c55e',
  in_progress: '#f59e0b',
  completed: '#64748b',
  cancelled: '#ef4444',
  no_show: '#94a3b8',
};

export const CARD_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b', '#a855f7',
];

export const TRIAL_DAYS = 7;
export const SUBSCRIPTION_PRICE_RUB = 200;
