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
import { combineDateTime } from './dates';

// Time helpers kept in this file so Netlify build never fails on missing imports
function calcEndTime(startTime: string, durationMinutes: number): string {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const parts = String(startTime).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const total = ((h % 24) * 60 + (m % 60) + mins) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');
}

function durationFromRange(startTime: string, endTime: string): number {
  const sp = String(startTime).split(':');
  const ep = String(endTime).split(':');
  let start = (Number(sp[0]) || 0) * 60 + (Number(sp[1]) || 0);
  let end = (Number(ep[0]) || 0) * 60 + (Number(ep[1]) || 0);
  if (end < start) end += 24 * 60;
  if (end === start) return 1;
  return Math.max(0, end - start);
}

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


function normalizeShareEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeSharePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('8') && d.length === 11) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d ? '+' + d : phone.trim();
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('email', '==', normalizeShareEmail(email)))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapUser(d.id, d.data() as Record<string, unknown>);
}

export async function findUserByPhone(phone: string): Promise<AppUser | null> {
  const normalized = normalizeSharePhone(phone);
  const variants = Array.from(
    new Set([normalized, phone.trim(), phone.replace(/\D/g, '')].filter(Boolean))
  );
  for (const v of variants) {
    const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', v)));
    if (!snap.empty) {
      const d = snap.docs[0];
      return mapUser(d.id, d.data() as Record<string, unknown>);
    }
  }
  return null;
}

export async function shareCalendar(
  calendarId: string,
  calendarName: string,
  fromUid: string,
  fromName: string,
  target: { email?: string; phone?: string },
  permission: 'edit' | 'view'
) {
  const toEmail = target.email ? normalizeShareEmail(target.email) : null;
  const toPhone = target.phone ? normalizeSharePhone(target.phone) : null;
  if (!toEmail && !toPhone) {
    throw new Error('Укажите email или телефон получателя');
  }

  let toUid: string | null = null;
  let targetUser: AppUser | null = null;
  if (toEmail) targetUser = await findUserByEmail(toEmail);
  if (!targetUser && toPhone) targetUser = await findUserByPhone(toPhone);
  if (targetUser) toUid = targetUser.uid;

  const ref = doc(collection(db, 'shares'));
  await setDoc(ref, {
    calendarId,
    calendarName,
    fromUid,
    fromName,
    toEmail,
    toPhone,
    toUid,
    permission,
    status: 'pending',
    createdAt: Timestamp.fromMillis(Date.now()),
  });

  const field = permission === 'edit' ? 'pendingEditors' : 'pendingViewers';
  const pendingValues = [toEmail, toPhone].filter(Boolean) as string[];
  if (pendingValues.length) {
    await updateDoc(doc(db, 'calendars', calendarId), {
      [field]: arrayUnion(...pendingValues),
      updatedAt: Timestamp.fromMillis(Date.now()),
    });
  }
  return ref.id;
}

export async function acceptShare(
  shareId: string,
  uid: string,
  profile?: { email?: string | null; phone?: string | null }
) {
  const ref = doc(db, 'shares', shareId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Приглашение не найдено');
  const data = snap.data();
  if (data.status !== 'pending') throw new Error('Приглашение уже обработано');

  const field = data.permission === 'edit' ? 'editors' : 'viewers';
  const pendingField = data.permission === 'edit' ? 'pendingEditors' : 'pendingViewers';
  const calRef = doc(db, 'calendars', data.calendarId as string);

  try {
    await updateDoc(calRef, {
      [field]: arrayUnion(uid),
      updatedAt: Timestamp.fromMillis(Date.now()),
    });
  } catch (e) {
    throw new Error(
      'Не удалось принять доступ. Опубликуйте новые firestore.rules. ' +
        (e instanceof Error ? e.message : '')
    );
  }

  const pendingClean = [
    data.toEmail,
    data.toPhone,
    profile?.email ? normalizeShareEmail(profile.email) : null,
    profile?.phone ? normalizeSharePhone(profile.phone) : null,
  ].filter(Boolean) as string[];
  if (pendingClean.length) {
    try {
      await updateDoc(calRef, { [pendingField]: arrayRemove(...pendingClean) });
    } catch {
      /* optional */
    }
  }

  await updateDoc(ref, {
    status: 'accepted',
    toUid: uid,
    acceptedAt: Timestamp.fromMillis(Date.now()),
  });
}

export async function rejectShare(shareId: string) {
  await updateDoc(doc(db, 'shares', shareId), {
    status: 'rejected',
    rejectedAt: Timestamp.fromMillis(Date.now()),
  });
}

export function subscribePendingShares(
  opts: {
    uid?: string | null;
    email?: string | null;
    phone?: string | null;
  },
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
    toUid: (data.toUid as string) || null,
    permission: data.permission as 'edit' | 'view',
    status: data.status as ShareInvite['status'],
    createdAt: tsToMs(data.createdAt),
  });

  const attach = (qRef: ReturnType<typeof query>) => {
    unsubs.push(
      onSnapshot(
        qRef,
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') map.delete(ch.doc.id);
            else map.set(ch.doc.id, mapShare(ch.doc.id, ch.doc.data() as Record<string, unknown>));
          });
          emit();
        },
        (err) => {
          console.error('shares subscribe error', err);
          emit();
        }
      )
    );
  };

  const email = opts.email ? normalizeShareEmail(opts.email) : null;
  const phone = opts.phone ? normalizeSharePhone(opts.phone) : null;
  const uid = opts.uid || null;
  let any = false;

  if (uid) {
    any = true;
    attach(
      query(collection(db, 'shares'), where('toUid', '==', uid), where('status', '==', 'pending'))
    );
  }
  if (email) {
    any = true;
    attach(
      query(collection(db, 'shares'), where('toEmail', '==', email), where('status', '==', 'pending'))
    );
  }
  if (phone) {
    any = true;
    attach(
      query(collection(db, 'shares'), where('toPhone', '==', phone), where('status', '==', 'pending'))
    );
  }

  if (!any) {
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
