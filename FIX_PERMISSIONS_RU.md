# Исправление: permission-denied (календарь / записи)

Ошибка в консоли:
```text
FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

Значит **Firestore Rules** блокируют чтение или запись. Сайт на Netlify уже ок — чиним Firebase.

---

## Что сделать (по порядку)

### Шаг 1. Убедиться, что правила из проекта задеплоены

На компьютере в папке проекта (где лежит `firestore.rules`):

```bash
firebase login
firebase use ВАШ_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Дождитесь:
```text
✔  Deploy complete!
```

> Если команды `firebase` нет:
> ```bash
> npm install -g firebase-tools
> ```

**Без этого шага** в консоли Firebase часто висят правила «deny all» (production mode) — отсюда permission-denied.

---

### Шаг 2. Проверить документ пользователя в Firestore

1. Откройте https://console.firebase.google.com  
2. Ваш проект → **Build** → **Firestore Database** → вкладка **Data**.  
3. Коллекция **`users`** → документ с вашим uid (как в Authentication → Users).  

Должны быть поля примерно такие:

| Поле | Пример значения |
|------|-----------------|
| `role` | `master` (строка) |
| `displayName` | ваше имя |
| `subscriptionStatus` | `trial` или `active` |
| `subscriptionExpiresAt` | **Timestamp** в будущем (не пусто, не number) |
| `email` | ваш email |

#### Если `subscriptionExpiresAt` пустой / отсутствует / число

1. Клик по документу → **Add field** / измените поле.  
2. Имя: `subscriptionExpiresAt`  
3. Тип: **timestamp**  
4. Значение: дата через **30 дней** от сегодня.  
5. `subscriptionStatus` = `trial` (string).  
6. **Update**.

#### Если документа `users/{uid}` нет

1. Authentication → Users → скопируйте **User UID**.  
2. Firestore → Start collection (если нет `users`) → Collection ID: `users`.  
3. Document ID: **вставьте UID** (не Auto-ID).  
4. Поля:

```text
role                    string     master
displayName             string     Мастер
email                   string     ваш@email.ru
phone                   null
subscriptionStatus      string     trial
subscriptionExpiresAt   timestamp  (сегодня + 30 дней)
trialStartedAt          timestamp  (сейчас)
notifyEmail             boolean    true
notifyPush              boolean    true
notifyMinutesBefore     number     60
createdAt               timestamp  (сейчас)
```

5. Save.

---

### Шаг 3. (Опционально) Временно открыть правила для проверки

Только чтобы убедиться, что проблема именно в rules. **Не оставляйте так в бою.**

Firestore → **Rules** → вставьте:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Publish**.

Обновите `https://zapisipro.netlify.app` (Ctrl+F5).  
Попробуйте создать календарь.

- Если **заработало** — проблема была в rules. Сразу задеплойте правильные из файла (Шаг 1) и не оставляйте открытые.  
- Если **нет** — смотрите Шаг 5 (не тот проект / не тот API key).

---

### Шаг 4. Задеплоить исправленные rules из проекта

В архиве/проекте файл `firestore.rules` уже исправлен (запросы календарей через `resource.data`, корректный trial).

```bash
firebase deploy --only firestore:rules
```

Или вручную: скопируйте содержимое `firestore.rules` → Firebase Console → Firestore → Rules → **Publish**.

---

### Шаг 5. Сверить Project ID Netlify ↔ Firebase

1. Netlify → Site → **Environment variables**  
2. `VITE_FIREBASE_PROJECT_ID` = ?  
3. Firebase → ⚙️ Project settings → **Project ID**  

Они **должны совпадать**.  
Если нет — поправьте все `VITE_FIREBASE_*` под этот проект →  
Netlify → Deploys → **Trigger deploy** → **Clear cache and deploy site**.

---

### Шаг 6. После фикса — создать календарь

1. Жёсткое обновление: Ctrl+Shift+R на `zapisipro.netlify.app`  
2. Выйти и войти снова (Ещё → Выйти → Вход).  
3. Вкладка **Календари** → **+** → название «Основной» → Сохранить.  
4. **Календарь** → **+** → запись.

В Console (F12) ошибки `permission-denied` должны пропасть.

---

### Шаг 7. Проверка Rules playground (если снова denied)

1. Firestore → **Rules** → **Rules playground**.  
2. Simulation type: **get**  
3. Location: `calendars/any`  
4. Auth: authenticated, вставьте свой uid.  
5. Run — смотрите, проходит ли.

Для **create**:
- Type: create  
- Location: `calendars/test1`  
- Auth: ваш uid  
- Data JSON:
```json
{
  "ownerId": "ВАШ_UID",
  "name": "Тест",
  "description": "",
  "color": "#6366f1",
  "isPrimary": true,
  "editors": [],
  "viewers": [],
  "pendingEditors": [],
  "pendingViewers": []
}
```

Если Simulate = Deny — читайте reason (обычно `hasActiveSub` / нет user doc).

---

## Почему так было

1. **Rules не задеплоены** после создания Firestore в production mode → всё denied.  
2. В старых rules чтение календаря шло через `get()`, из‑за этого **onSnapshot-запросы** (`where ownerId == …`) получали permission-denied даже на пустой коллекции.  
3. Нет / битый `subscriptionExpiresAt` → `hasActiveSub()` = false → нельзя создать календарь.

---

## Быстрый минимум (5 минут)

```text
1) firebase deploy --only firestore:rules
2) Firestore → users → ваш uid → subscriptionStatus=trial,
   subscriptionExpiresAt = timestamp +30 дней
3) Ctrl+Shift+R на zapisipro.netlify.app
4) Календари → создать «Основной»
```

Если после этого всё ещё красный Console — пришлите:
- скрин документа `users/{uid}` из Firestore  
- Project ID из Firebase и значение `VITE_FIREBASE_PROJECT_ID` из Netlify  
- текст из Rules playground при Simulate create calendar
