# Обновление формы «Новая запись» — клик за кликом

Цель:
- **Длительность** — свободный ввод любого числа минут (или можно не трогать, считать из окончания)
- **Окончание** — свободный ручной ввод времени (10:00, 11:45…)
- Сборка Netlify **не падает** (ошибка `durationFromRange` исправлена)

---

## Часть 1. Скачать исправленный проект

1. В чате нажмите **Download** у файла **`master-calendar-app.zip`**  
   (или **`master-calendar.zip`** — то же самое).
2. Сохраните на компьютер, например в папку **Загрузки**.
3. ПКМ по zip → **Извлечь всё…** → папка `calendar-app`  
   (или `master-calendar-app`).

---

## Часть 2. Способ A — через GitHub (если сайт уже из репозитория)

### 2.1. Открыть папку проекта

1. Откройте **Cursor / VS Code**.  
2. **File → Open Folder**.  
3. Выберите **вашу** папку репозитория (ту, что связана с Netlify), не обязательно новую из zip.

### 2.2. Заменить 3 файла из zip

Из распакованного zip скопируйте **с заменой** в свой проект:

| Файл из zip | Куда |
|-------------|------|
| `src/components/AppointmentForm.tsx` | `src/components/AppointmentForm.tsx` |
| `src/lib/api.ts` | `src/lib/api.ts` |
| `src/lib/dates.ts` | `src/lib/dates.ts` |

**Windows:**  
1. Откройте обе папки в проводнике.  
2. Скопируйте 3 файла.  
3. Вставьте в те же пути своего проекта → **Заменить**.

**Проверка `api.ts` (важно!):**  
Откройте `src/lib/api.ts` и найдите примерно в начале (после `trialDefaults`):

```ts
import { combineDateTime } from './dates';

function calcEndTime(...) { ... }
function durationFromRange(...) { ... }
```

Функции `calcEndTime` и `durationFromRange` должны быть **прямо в api.ts**.  
Тогда Netlify **не** выдаст `Cannot find name 'durationFromRange'`.

### 2.3. Проверка на компьютере (желательно)

В терминале VS Code:

```bash
cd путь\к\вашему\проекту
npm install
npm run build
```

Должно закончиться без ошибок (`✓ built`).  
Если ошибка — не пушьте, пришлите текст.

### 2.4. Отправить на GitHub

```bash
git add src/components/AppointmentForm.tsx src/lib/api.ts src/lib/dates.ts
git status
git commit -m "fix: free duration and end time, stable Netlify build"
git push
```

1. Дождитесь `push` без ошибок.  
2. Откройте https://app.netlify.com  
3. Слева **Deploys**.  
4. Дождитесь новый деплой → статус **Published** (зелёный).  
5. Если деплой не начался: **Trigger deploy** → **Deploy site**.  
6. Если снова fail: **Trigger deploy** → **Clear cache and deploy site**.

### 2.5. Проверить сайт

1. Откройте ваш сайт (например `https://zapisipro.netlify.app`).  
2. **Ctrl + Shift + R** (жёсткое обновление).  
3. Войдите как мастер.  
4. **Календарь** → кнопка **+** (Новая запись).  
5. Проверьте поля:

| Поле | Что можно |
|------|-----------|
| **Начало** | Ввести `10:00` или `9:30` вручную |
| **Длительность** | Любое число: `75`, `200`, `15`… |
| **Окончание** | Ввести `12:15` вручную |

6. Заполните клиент + услуга → **Создать запись**.  
7. В списке должна быть запись с вашим временем.

---

## Часть 3. Способ B — правка прямо на GitHub (без компьютера)

Если лень локально — правьте 1 файл, из‑за которого падал билд, и форму.

### 3.1. Открыть репозиторий

1. https://github.com → ваш логин.  
2. Репозиторий **master-calendar** (или как назвали).  
3. Ветка **main**.

### 3.2. Исправить `src/lib/api.ts`

1. Клик по папке **`src`**.  
2. Клик **`lib`**.  
3. Клик файл **`api.ts`**.  
4. Кнопка карандаша **Edit this file**.  
5. В **самом верху** файла найдите строки с `from './dates'`.  
6. **Удалите** старую строку вида:
   ```ts
   import { combineDateTime, calcEndTime, durationFromRange } from './dates';
   ```
   (если есть).  
7. Сразу **после** строки  
   `import { trialDefaults } from './subscription';`  
   **вставьте** этот блок целиком:

```ts
import { combineDateTime } from './dates';

function calcEndTime(startTime: string, durationMinutes: number): string {
  const mins = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const parts = String(startTime).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const total = ((h % 24) * 60 + (m % 60) + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
```

8. Прокрутите вниз → **Commit changes** → **Commit changes**.

### 3.3. Заменить форму (рекомендуется)

Надёжнее залить из zip файл `AppointmentForm.tsx` через GitHub:

1. `src/components/AppointmentForm.tsx` → карандаш.  
2. Выделить всё (**Ctrl+A**) → Delete.  
3. Открыть на компьютере из zip тот же файл → **Ctrl+A**, **Ctrl+C**.  
4. Вставить в GitHub → **Commit changes**.

### 3.4. Netlify

1. https://app.netlify.com → ваш сайт.  
2. **Deploys** → дождаться **Published**.  
3. Открыть сайт → Ctrl+Shift+R → проверить «Новая запись».

---

## Часть 4. Способ C — ручной deploy папки dist (без Git)

1. Распакуйте zip.  
2. В папке проекта создайте `.env.local` с вашими `VITE_FIREBASE_*` (как на Netlify).  
3. В терминале:
   ```bash
   npm install
   npm run build
   ```
4. Netlify → сайт → **Deploys** → **Deploy manually**.  
5. Перетащите папку **`dist`**.  
6. Дождитесь Published.

---

## Часть 5. Если деплой снова красный

### Ошибка `Cannot find name 'durationFromRange'`

→ В `api.ts` **нет** локальной функции `durationFromRange`.  
Повторите **часть 3.2** или залейте целый `api.ts` из zip.

### Ошибка другая (TypeScript)

1. Netlify → failed deploy → **Deploy log**.  
2. Скопируйте **красные** строки.  
3. Пришлите их.

### Сайт старый после успешного деплоя

1. Ctrl+Shift+R.  
2. Или режим инкогнито.  
3. Netlify → **Clear cache and deploy site**.

---

## Часть 6. Как пользоваться новой формой

1. **+** → Новая запись.  
2. **Дата** — календарь.  
3. **Начало** — напечатайте `10:00`.  
4. **Длительность** — например `90` (минуты без потолка).  
   → Окончание само станет `11:30`.  
5. **Или** сразу в **Окончание** введите `12:00`  
   → длительность пересчитается.  
6. Чипы `15 м`, `1 ч`… — только быстрый выбор.  
7. Клиент + услуга → **Создать запись**.

---

## Краткий чеклист

- [ ] Скачан новый zip  
- [ ] Заменены `AppointmentForm.tsx`, `api.ts`, `dates.ts`  
- [ ] В `api.ts` есть **локальные** `calcEndTime` и `durationFromRange`  
- [ ] `npm run build` локально ок (или commit на GitHub)  
- [ ] Netlify **Published**  
- [ ] На сайте свободные длительность и окончание  

Готово.
