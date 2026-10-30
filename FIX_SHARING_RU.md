# Исправление шаринга календарей

## В чём была проблема

1. Приглашение писалось в `shares`, но **получатель часто не видел** его:
   - query по email/phone + rules, завязанные только на `request.auth.token.email`
   - нет composite index `toEmail + status`
2. Даже при «Принять» **Firestore rules запрещали** invitee писать в `calendars.editors/viewers` (только owner).
3. У **клиента** не было пункта меню «Доступ» — некуда было зайти принять.
4. Email/телефон при отправке и при поиске могли **не совпадать** (регистр, формат +7).

## Что исправлено в коде

- `firestore.rules` — invitee может добавить **свой uid** в editors/viewers (self-accept)
- `firestore.indexes.json` — индексы для shares
- `api.ts` — нормализация email/phone, `toUid`, подписка по uid+email+phone, accept с очисткой pending
- `SharePage` — приглашения видны всем ролям + список «Календари с доступом»
- `BottomNav` — вкладка **Доступ** у мастера и клиента

---

## Что сделать вам (клик за кликом)

### 1. Задеплоить код на Netlify

Замените в репозитории (из zip):

- `src/lib/api.ts`
- `src/pages/SharePage.tsx`
- `src/components/BottomNav.tsx`
- `src/types/index.ts`
- `firestore.rules`
- `firestore.indexes.json`

```bash
git add src firestore.rules firestore.indexes.json
git commit -m "fix calendar sharing accept and invites UI"
git push
```

Netlify → Published.

### 2. ОБЯЗАТЕЛЬНО: Firebase Rules + Indexes

Без этого «Принять» снова упадёт.

В папке проекта:

```bash
firebase login
firebase use ВАШ_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Или вручную:

1. Firebase Console → **Firestore** → **Rules**  
2. Вставьте содержимое файла `firestore.rules` из zip → **Publish**  
3. **Indexes** → дождитесь, пока индексы `shares` станут Enabled  
   (или Deploy indexes командой выше)

### 3. Как пользоваться правильно

#### Мастер
1. Войти мастером  
2. **Доступ** → календарь → права (просмотр / редактирование)  
3. Email **точно как у клиента в регистрации** (или телефон +7…)  
4. **Отправить приглашение**  
5. В Firestore `shares` появится документ `status: pending`

#### Клиент / второй мастер
1. Войти **тем же email/телефоном**  
2. Нижнее меню → **Доступ**  
3. Блок **«Вам открыли доступ»** → **Принять**  
4. Календарь появится в **Календарь** (и в «Календари с доступом»)

### 4. Старые приглашения в Firestore

Если share создан **до** фикса:

- `toEmail` мог быть с другим регистром  
- Можно вручную:  
  - либо удалить старый share и отправить заново  
  - либо в документе `shares` поправить `toEmail` на lower-case email клиента  
  - и в `calendars/{id}` в `pendingViewers` / `pendingEditors` добавить тот же email

### 5. Проверка в Console браузера (F12)

У получателя на «Доступ»:

- Не должно быть `permission-denied` на `shares`  
- При «Принять» не должно быть `permission-denied` на `calendars`

Если denied на calendars — **rules не опубликованы** (шаг 2).

---

## Быстрый тест

1. Мастер: share на `test@mail.ru` view  
2. Клиент `test@mail.ru`: Доступ → видно приглашение  
3. Принять  
4. В Firestore:  
   - `shares` → `status: accepted`  
   - `calendars` → `viewers` содержит uid клиента  
5. Клиент: Календарь показывает записи (read-only, без +)

Готово.
