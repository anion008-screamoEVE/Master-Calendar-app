import type { AppUser, SubscriptionStatus } from '../types';
import { TRIAL_DAYS } from '../types';

export function computeExpiresAt(fromMs: number, days: number): number {
  return fromMs + days * 24 * 60 * 60 * 1000;
}

export function trialDefaults(now = Date.now()) {
  return {
    subscriptionStatus: 'trial' as SubscriptionStatus,
    trialStartedAt: now,
    subscriptionExpiresAt: computeExpiresAt(now, TRIAL_DAYS),
  };
}

export function isSubscriptionActive(user: AppUser | null | undefined): boolean {
  if (!user || user.role !== 'master') return false;
  if (user.subscriptionStatus === 'none' || user.subscriptionStatus === 'expired') return false;
  return user.subscriptionExpiresAt > Date.now();
}

export function daysLeft(user: AppUser | null | undefined): number {
  if (!user) return 0;
  const ms = user.subscriptionExpiresAt - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function subscriptionLabel(user: AppUser | null | undefined): string {
  if (!user || user.role !== 'master') return '';
  if (!isSubscriptionActive(user)) return 'Подписка неактивна';
  const d = daysLeft(user);
  if (user.subscriptionStatus === 'trial') return `Пробный период: осталось ${d} дн.`;
  return `Подписка активна: ${d} дн.`;
}
