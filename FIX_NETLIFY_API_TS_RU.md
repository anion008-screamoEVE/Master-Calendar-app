# Исправление ошибки Netlify TS1003 / TS1128 в api.ts

## Ошибка в логе

```text
src/lib/api.ts(31,25): error TS1003: Identifier expected.
src/lib/api.ts(31,29): error TS1128: Declaration or statement expected.
src/lib/api.ts(32,31): error TS1003: Identifier expected.
src/lib/api.ts(32,35): error TS1128: Declaration or statement expected.
```

Это **синтаксис сломан** в начале `src/lib/api.ts` (часто после ручного редактирования на GitHub: кривые кавычки, обрыв строки, «красивое» тире).

---

## Самый надёжный способ (клик за кликом)

### 1. Скачайте новый zip

Файл **master-calendar-app.zip** из чата → Извлечь.

### 2. Замените ОДИН файл целиком

1. Откройте https://github.com → ваш репозиторий master-calendar.  
2. Путь: **`src` → `lib` → `api.ts`**.  
3. Кнопка **карандаша** (Edit).  
4. **Ctrl+A** (выделить всё) → **Delete**.  
5. На компьютере откройте из zip файл:
   ```text
   calendar-app/src/lib/api.ts
   ```
   (Блокнот / VS Code) → **Ctrl+A** → **Ctrl+C**.  
6. Вставьте в GitHub (**Ctrl+V**).  
7. Прокрутите вниз → **Commit changes** → **Commit changes**.

### 3. (Рекомендуется) Замените форму тоже

То же самое для:

```text
src/components/AppointmentForm.tsx
```

### 4. Netlify

1. https://app.netlify.com → сайт **zapisipro**.  
2. **Deploys**.  
3. Должен начаться новый деплой.  
4. Если нет: **Trigger deploy** → **Clear cache and deploy site**.  
5. Дождитесь **Published** (зелёный).

### 5. Проверка сайта

1. https://zapisipro.netlify.app  
2. **Ctrl+Shift+R**.  
3. Календарь → **+** → длительность и окончание вручную.

---

## Если правите только начало api.ts вручную

Строки **1–55** файла должны выглядеть **точно** так (без «умных» кавычек Word):

```ts
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
```

Дальше файл продолжается как был (`mapUser`, `createAppointment`…).

**Нельзя:**
- копировать из Word / Telegram с «кривыми» кавычками `'` `'`  
- оставлять обрубок `import { combineDateTime,` без конца  
- вставлять HTML или markdown в файл

---

## Альтернатива: git push с компьютера

```bash
# распаковали zip, скопировали api.ts и AppointmentForm.tsx в проект
git add src/lib/api.ts src/components/AppointmentForm.tsx
git commit -m "fix broken api.ts syntax for Netlify"
git push
```

---

## После успеха

В Deploy log больше не будет TS1003/TS1128, будет `Site is live` / Published.
