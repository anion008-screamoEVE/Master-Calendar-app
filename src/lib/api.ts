import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  AppUser,
  Calendar,
  Appointment,
  ShareInvite,
  UserRole,
  AppointmentStatus,
} from '../types';
import { trialDefaults } from './subscription';
import { combineDateTime, calcEndTime, durationFromRange } from './dates';

function tsToMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'object' && v !== null && 'seconds' in v) {
    return (v as { seconds: number }).seconds * 1000;
  }
  return 0;
}

function mapUser(id: string, data: Record<string, unknown>): AppUser {
  return {
    uid: id,
    role: data.role as UserRole,
    displayName: (data.displayName as string) || '',
    email: (data.email as string) || null,
    phone: (data.phone as string) || null,
    photoURL: (data.photoURL as string) || null,
    subscriptionStatus: (data.subscriptionStatus as AppUser['subscriptionStatus']) || 'none',
    subscriptionExpiresAt: tsToMs(data.subscriptionExpiresAt),
    trialStartedAt: tsToMs(data.trialStartedAt),
    notifyEmail: data.notifyEmail !== false,
    notifyPush: data.notifyPush !== false,
    notifyMinutesBefore: (data.notifyMinutesBefore as number) || 60,
    createdAt: tsToMs(data.createdAt) || Date.now(),
    fcmTokens: (data.fcmTokens as string[]) || [],
  };
}

function mapCalendar(id: string, data: Record<string, unknown>): Calendar {
  return {
    id,
    ownerId: data.ownerId as string,
    name: data.name as string,
    description: (data.description as string) || '',
    color: (data.color as string) || '#6366f1',
    isPrimary: Boolean(data.isPrimary),
    editors: (data.editors as string[]) || [],
    viewers: (data.viewers as string[]) || [],
    pendingEditors: (data.pendingEditors as string[]) || [],
    pendingViewers: (data.pendingViewers as string[]) || [],
    createdAt: tsToMs(data.createdAt),
    updatedAt: tsToMs(data.updatedAt),
  };
}

function mapAppointment(id: string, data: Record<string, unknown>): Appointment {
  return {
    id,
    calendarId: data.calendarId as string,
    date: data.date as string,
    startTime: data.startTime as string,
    endTime: data.endTime as string,
    masterName: (data.masterName as string) || '',
    clientName: (data.clientName as string) || '',
    clientPhone: (data.clientPhone as string) || '',
    clientEmail: (data.clientEmail as string) || '',
    service: (data.service as string) || '',
    description: (data.description as string) || '',
    status: (data.status as AppointmentStatus) || 'scheduled',
    price: Number(data.price) || 0,
    currency: (data.currency as string) || 'RUB',
    color: (data.color as string) || '#6366f1',
    durationMinutes: Number(data.durationMinutes) || 60,
    location: (data.location as string) || '',
    notes: (data.notes as string) || '',
    createdBy: data.createdBy as string,
    createdAt: tsToMs(data.createdAt),
    updatedAt: tsToMs(data.updatedAt),
    notifyAt: data.notifyAt ? tsToMs(data.notifyAt) : null,
    notified: Boolean(data.notified),
    clientUid: (data.clientUid as string) || null,
  };
}

export async function createUserProfile(
  uid: string,
  data: {
    role: UserRole;
    displayName: string;
    email: string | null;
    phone: string | null;
  }
): Promise<AppUser> {
  const now = Date.now();
  const base = {
    role: data.role,
    displayName: data.displayName,
    email: data.email,
    phone: data.phone,
    photoURL: null,
    notifyEmail: true,
    notifyPush: true,
    notifyMinutesBefore: 60,
    createdAt: now,
    fcmTokens: [] as string[],
  };
  const sub =
    data.role === 'master'
      ? trialDefaults(now)
      : { subscriptionStatus: 'none' as const, trialStartedAt: 0, subscriptionExpiresAt: 0 };

  const payload = { ...base, ...sub };
  await setDoc(doc(db, 'users', uid), {
    ...payload,
    createdAt: serverTimestamp(),
    subscriptionExpiresAt:
      data.role === 'master' ? Timestamp.fromMillis(sub.subscriptionExpiresAt) : null,
    trialStartedAt: data.role === 'master' ? Timestamp.fromMillis(now) : null,
  });
  return mapUser(uid, payload as unknown as Record<string, unknown>);
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return mapUser(snap.id, snap.data() as Record<string, unknown>);
}

export function subscribeUser(uid: string, cb: (u: AppUser | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb(mapUser(snap.id, snap.data() as Record<string, unknown>));
  });
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<AppUser, 'displayName' | 'notifyEmail' | 'notifyPush' | 'notifyMinutesBefore'>>
) {
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function createCalendar(
  ownerId: string,
  data: { name: string; description?: string; color?: string; isPrimary?: boolean }
): Promise<string> {
  const ref = doc(collection(db, 'calendars'));
  const now = Date.now();
  await setDoc(ref, {
    ownerId,
    name: data.name,
    description: data.description || '',
    color: data.color || '#6366f1',
    isPrimary: Boolean(data.isPrimary),
    editors: [],
    viewers: [],
    pendingEditors: [],
    pendingViewers: [],
    createdAt: Timestamp.fromMillis(now),
    updatedAt: Timestamp.fromMillis(now),
  });
  return ref.id;
}

export function subscribeCalendarsForUser(
  uid: string,
  cb: (list: Calendar[]) => void
): Unsubscribe {
  const map = new Map<string, Calendar>();
  const emit = () => cb(Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt));
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(query(collection(db, 'calendars'), where('ownerId', '==', uid)), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') map.delete(ch.doc.id);
        else map.set(ch.doc.id, mapCalendar(ch.doc.id, ch.doc.data() as Record<string, unknown>));
      });
      emit();
    })
  );
  unsubs.push(
    onSnapshot(query(collection(db, 'calendars'), where('editors', 'array-contains', uid)), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') {
          const d = ch.doc.data();
          if (d.ownerId !== uid) map.delete(ch.doc.id);
        } else map.set(ch.doc.id, mapCalendar(ch.doc.id, ch.doc.data() as Record<string, unknown>));
      });
      emit();
    })
  );
  unsubs.push(
    onSnapshot(query(collection(db, 'calendars'), where('viewers', 'array-contains', uid)), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') {
          const d = ch.doc.data();
          if (d.ownerId !== uid && !(d.editors || []).includes(uid)) map.delete(ch.doc.id);
        } else map.set(ch.doc.id, mapCalendar(ch.doc.id, ch.doc.data() as Record<string, unknown>));
      });
      emit();
    })
  );

  return () => unsubs.forEach((u) => u());
}

export async function updateCalendar(
  id: string,
  patch: Partial<Pick<Calendar, 'name' | 'description' | 'color'>>
) {
  await updateDoc(doc(db, 'calendars', id), {
    ...patch,
    updatedAt: Timestamp.fromMillis(Date.now()),
  });
}

export async function deleteCalendar(id: string) {
  const q = query(collection(db, 'appointments'), where('calendarId', '==', id));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'calendars', id));
}

export async function shareCalendar(
  calendarId: string,
  calendarName: string,
  fromUid: string,
  fromName: string,
  target: { email?: string; phone?: string },
  permission: 'edit' | 'view'
) {
  const ref = doc(collection(db, 'shares'));
  await setDoc(ref, {
    calendarId,
    calendarName,
    fromUid,
    fromName,
    toEmail: target.email || null,
    toPhone: target.phone || null,
    permission,
    status: 'pending',
    createdAt: Timestamp.fromMillis(Date.now()),
  });
  const field = permission === 'edit' ? 'pendingEditors' : 'pendingViewers';
  const value = target.email || target.phone || '';
  if (value) {
    await updateDoc(doc(db, 'calendars', calendarId), {
      [field]: arrayUnion(value),
      updatedAt: Timestamp.fromMillis(Date.now()),
    });
  }
  return ref.id;
}

export async function acceptShare(shareId: string, uid: string) {
  const ref = doc(db, 'shares', shareId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Приглашение не найдено');
  const data = snap.data();
  const field = data.permission === 'edit' ? 'editors' : 'viewers';
  await updateDoc(doc(db, 'calendars', data.calendarId), {
    [field]: arrayUnion(uid),
    updatedAt: Timestamp.fromMillis(Date.now()),
  });
  await updateDoc(ref, { status: 'accepted' });
}

export async function rejectShare(shareId: string) {
  await updateDoc(doc(db, 'shares', shareId), { status: 'rejected' });
}

export function subscribePendingShares(
  email: string | null,
  phone: string | null,
  cb: (list: ShareInvite[]) => void
): Unsubscribe {
  const map = new Map<string, ShareInvite>();
  const emit = () =>
    cb(
      Array.from(map.values())
        .filter((s) => s.status === 'pending')
        .sort((a, b) => b.createdAt - a.createdAt)
    );
  const unsubs: Unsubscribe[] = [];
  const mapShare = (id: string, data: Record<string, unknown>): ShareInvite => ({
    id,
    calendarId: data.calendarId as string,
    calendarName: data.calendarName as string,
    fromUid: data.fromUid as string,
    fromName: (data.fromName as string) || '',
    toEmail: (data.toEmail as string) || null,
    toPhone: (data.toPhone as string) || null,
    permission: data.permission as 'edit' | 'view',
    status: data.status as ShareInvite['status'],
    createdAt: tsToMs(data.createdAt),
  });

  if (email) {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'shares'), where('toEmail', '==', email), where('status', '==', 'pending')),
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') map.delete(ch.doc.id);
            else map.set(ch.doc.id, mapShare(ch.doc.id, ch.doc.data() as Record<string, unknown>));
          });
          emit();
        }
      )
    );
  }
  if (phone) {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'shares'), where('toPhone', '==', phone), where('status', '==', 'pending')),
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') map.delete(ch.doc.id);
            else map.set(ch.doc.id, mapShare(ch.doc.id, ch.doc.data() as Record<string, unknown>));
          });
          emit();
        }
      )
    );
  }
  if (!email && !phone) {
    cb([]);
    return () => undefined;
  }
  return () => unsubs.forEach((u) => u());
}

export async function removeCalendarMember(
  calendarId: string,
  uid: string,
  permission: 'edit' | 'view'
) {
  const field = permission === 'edit' ? 'editors' : 'viewers';
  await updateDoc(doc(db, 'calendars', calendarId), {
    [field]: arrayRemove(uid),
    updatedAt: Timestamp.fromMillis(Date.now()),
  });
}

export type AppointmentInput = Omit<
  Appointment,
  'id' | 'createdAt' | 'updatedAt' | 'notified' | 'notifyAt' | 'endTime'
> & { endTime?: string; notifyMinutesBefore?: number };

export async function createAppointment(
  input: AppointmentInput,
  notifyMinutesBefore = 60
): Promise<string> {
  const ref = doc(collection(db, 'appointments'));
  const now = Date.now();

  // Без лимитов: сохраняем endTime с формы как есть
  let endTime = (input.endTime || '').trim();
  let duration = Math.floor(Number(input.durationMinutes) || 0);
  if (endTime) {
    if (duration < 1) duration = durationFromRange(input.startTime, endTime) || 1;
  } else {
    if (duration < 1) duration = 1;
    endTime = calcEndTime(input.startTime, duration);
  }

  const startDt = combineDateTime(input.date, input.startTime);
  const notifyAt = startDt.getTime() - notifyMinutesBefore * 60 * 1000;

  await setDoc(ref, {
    ...input,
    durationMinutes: duration,
    endTime,
    notifyAt: Timestamp.fromMillis(notifyAt),
    notified: false,
    createdAt: Timestamp.fromMillis(now),
    updatedAt: Timestamp.fromMillis(now),
  });
  return ref.id;
}

export async function updateAppointment(
  id: string,
  patch: Partial<Appointment>,
  notifyMinutesBefore = 60
) {
  const data: Record<string, unknown> = {
    ...patch,
    updatedAt: Timestamp.fromMillis(Date.now()),
  };
  delete data.id;

  // Уважаем ручной endTime; duration без верхнего потолка
  if (patch.endTime && patch.startTime) {
    data.endTime = patch.endTime;
    if (patch.durationMinutes == null || Number(patch.durationMinutes) < 1) {
      data.durationMinutes = durationFromRange(patch.startTime, patch.endTime) || 1;
    } else {
      data.durationMinutes = Math.floor(Number(patch.durationMinutes));
    }
  } else if (patch.durationMinutes != null && patch.startTime && !patch.endTime) {
    const d = Math.max(1, Math.floor(Number(patch.durationMinutes) || 1));
    data.durationMinutes = d;
    data.endTime = calcEndTime(patch.startTime, d);
  } else if (patch.durationMinutes != null) {
    data.durationMinutes = Math.max(1, Math.floor(Number(patch.durationMinutes) || 1));
  }

  if (patch.date && patch.startTime) {
    const startDt = combineDateTime(patch.date, patch.startTime);
    data.notifyAt = Timestamp.fromMillis(startDt.getTime() - notifyMinutesBefore * 60 * 1000);
    data.notified = false;
  }
  await updateDoc(doc(db, 'appointments', id), data);
}

export async function deleteAppointment(id: string) {
  await deleteDoc(doc(db, 'appointments', id));
}

export function subscribeAppointments(
  calendarId: string,
  fromDate: string,
  toDate: string,
  cb: (list: Appointment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'appointments'),
    where('calendarId', '==', calendarId),
    where('date', '>=', fromDate),
    where('date', '<=', toDate),
    orderBy('date', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => mapAppointment(d.id, d.data() as Record<string, unknown>));
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    cb(list);
  });
}
