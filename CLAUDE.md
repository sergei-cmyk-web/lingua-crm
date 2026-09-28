# CRM для онлайн-школы иностранных языков (LinguaCRM)

## О проекте

CRM-система под брендом **LinguaCRM**, замещающая amoCRM, для онлайн-школы иностранных языков. Основные сущности: сделки (deals), контакты (contacts), компании (companies), задачи (tasks). Работа с воронкой через канбан-доску, интеграция с мессенджерами (WazzUp) и SIP-телефонией (UIS/ЮИС).

**Масштаб:** 10–50 менеджеров, до 10 000 активных сделок.
**Деплой:** Docker Compose + VPS/выделенный сервер.
**Статусы фич:** `docs/ROADMAP-full.md` — сводный чеклист «реализовано / осталось» по всем направлениям (фичи, безопасность, масштаб, мульти-ниша, ручные действия на проде). Описания фич — `docs/ROADMAP.md`.

---

## Технологический стек

### Frontend
- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui** — UI-компоненты
- **@dnd-kit/core** — drag-and-drop для канбан-доски
- **TanStack Query (React Query)** — серверный стейт, кэширование, инвалидация
- **Zustand** — клиентский стейт (активные фильтры, открытые модальники, UI-стейт)
- **Socket.io-client** — реалтайм-обновления канбана
- **Recharts** — графики в разделе аналитики
- **React Hook Form + Zod** — формы и валидация

### Backend
- **Node.js + Express** (TypeScript)
- **Prisma ORM** + **PostgreSQL 16** — основная БД
- **Redis** — очереди задач (BullMQ), кэш сессий
- **BullMQ** — движок автоматизаций (триггеры → действия)
- **Socket.io** — реалтайм-сервер
- **JWT** — авторизация (access + refresh токены)

### Инфраструктура
- **Docker Compose** — сборка всех сервисов
- **Nginx** — reverse proxy, SSL termination
- **PostgreSQL 16** + **Redis 7** — в отдельных контейнерах

---

## Структура монорепозитория

```
crm/
├── CLAUDE.md
├── docker-compose.yml          # prod
├── docker-compose.dev.yml      # dev с hot-reload
├── nginx/
│   └── nginx.conf
├── .env.example
│
├── apps/
│   ├── web/                    # Next.js 14 фронтенд
│   │   ├── src/
│   │   │   ├── app/            # App Router
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/page.tsx
│   │   │   │   │   └── layout.tsx
│   │   │   │   └── (dashboard)/
│   │   │   │       ├── layout.tsx
│   │   │   │       ├── pipeline/[id]/page.tsx   # Канбан-доска
│   │   │   │       ├── deals/page.tsx           # Список сделок
│   │   │   │       ├── deals/[id]/page.tsx      # Карточка сделки на весь экран (открывается в новой вкладке)
│   │   │   │       ├── contacts/page.tsx
│   │   │   │       ├── contacts/[id]/page.tsx
│   │   │   │       ├── companies/page.tsx
│   │   │   │       ├── companies/[id]/page.tsx
│   │   │   │       ├── tasks/page.tsx
│   │   │   │       ├── email/page.tsx           # Почта: единый инбокс (треды по threadKey, реалтайм)
│   │   │   │       ├── chats/page.tsx           # Чаты: единый инбокс мессенджеров, группировка по contactId
│   │   │   │       ├── analytics/page.tsx
│   │   │   │       ├── trash/page.tsx           # Корзина (admin): восстановить / удалить навсегда
│   │   │   │       │                            #   пункт в сайдбаре виден только админам
│   │   │   │       └── settings/
│   │   │   │           ├── layout.tsx           # Общий суб-нав: CRM | Интеграции
│   │   │   │           ├── pipeline/page.tsx    # Настройка воронки (+типы этапов, причины потери)
│   │   │   │           ├── fields/page.tsx      # Кастомные поля
│   │   │   │           ├── automations/page.tsx # Автоматизации
│   │   │   │           ├── trials/page.tsx      # Офсеты/шаблоны напоминаний о пробных
│   │   │   │           ├── packages/page.tsx    # Справочник пакетов уроков (абонементы)
│   │   │   │           ├── wazzup/page.tsx      # WazzUp-каналы
│   │   │   │           ├── sms/page.tsx         # Креды TargetSMS + тест баланса
│   │   │   │           ├── email/page.tsx       # Почтовые ящики (SMTP/IMAP): владелец + допущенные, тест подключения
│   │   │   │           ├── payments/page.tsx    # CloudPayments/Робокасса + этап после оплаты
│   │   │   │           ├── lead-form/page.tsx   # Воронка/этап/ключ лид-формы + пример curl
│   │   │   │           └── integrations/page.tsx  # redirect → /settings/wazzup
│   │   │   ├── components/
│   │   │   │   ├── kanban/
│   │   │   │   │   ├── KanbanBoard.tsx
│   │   │   │   │   ├── KanbanColumn.tsx
│   │   │   │   │   └── DealCard.tsx
│   │   │   │   ├── deal/
│   │   │   │   │   ├── DealDetail.tsx          # Карточка сделки (рендерится на весь экран в deals/[id])
│   │   │   │   │   ├── TrialLessonCard.tsx     # Блок «Пробный урок» (запись/перенос/результат, мульти-каналы напоминаний)
│   │   │   │   │   ├── SubscriptionCard.tsx    # Абонемент: баланс, уроки, счета (также на странице контакта)
│   │   │   │   │   ├── InvoiceDialog.tsx       # «Выставить счёт»: пакет + корректировка + ссылка + выбор канала/номера и редактируемый текст по шаблону
│   │   │   │   │   ├── LostReasonDialog.tsx    # Причина потери (канбан + DealDetail)
│   │   │   │   │   ├── NewMessageDialog.tsx    # Первый контакт (мессенджеры)
│   │   │   │   │   ├── DealForm.tsx
│   │   │   │   │   └── ActivityFeed.tsx
│   │   │   │   ├── entity/
│   │   │   │   │   ├── CustomFieldsRenderer.tsx # Рендер JSONB-полей
│   │   │   │   │   └── EntityForm.tsx
│   │   │   │   ├── telephony/
│   │   │   │   │   └── CallWidget.tsx
│   │   │   │   └── ui/                         # shadcn/ui компоненты
│   │   │   ├── lib/
│   │   │   │   ├── api/                        # API-клиент (fetch wrappers)
│   │   │   │   ├── hooks/                      # useDeals, useContacts, ...
│   │   │   │   ├── channelOptions.ts           # Варианты каналов (контакт.channels + WhatsApp/SMS по телефонам + email) — общее для TrialLessonCard, InvoiceDialog, NewMessageDialog, MessagesTab
│   │   │   │   ├── invoiceTemplate.ts          # Шаблон сообщения со ссылкой на оплату (рендер плейсхолдеров)
│   │   │   │   └── socket.ts
│   │   │   └── store/
│   │   │       ├── ui.store.ts
│   │   │       └── filters.store.ts
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── index.ts        # Entry point
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── deals.ts       # + POST /:id/trials, экспортирует dealInclude
│       │   │   ├── trials.ts      # PATCH /api/trials/:id (перенос/каналы/результат)
│       │   │   ├── contacts.ts
│       │   │   ├── companies.ts
│       │   │   ├── tasks.ts
│       │   │   ├── pipelines.ts   # + Stage.type в stageSchema, PATCH stages под zod
│       │   │   ├── lost-reasons.ts # Справочник причин потери (CRUD admin, мягкая деактивация)
│       │   │   ├── packages.ts    # Справочник пакетов уроков (CRUD admin)
│       │   │   ├── subscriptions.ts # Абонементы + уроки (списание с guard-ом)
│       │   │   ├── payments.ts    # Выставление счетов, история, отмена
│       │   │   ├── trash.ts       # Корзина (admin): список/restore/удалить навсегда + purge 30 дней
│       │   │   ├── email-accounts.ts # CRUD SMTP/IMAP-ящиков (admin), тест подключения
│       │   │   ├── email.ts       # Почта: /threads, /threads/:threadKey, /compose, /attachments/:id/download
│       │   │   ├── chats.ts       # Чаты: GET /, GET /:contactId, POST /:contactId/messages (только ответ)
│       │   │   ├── fields.ts    # Управление кастомными полями
│       │   │   ├── analytics.ts
│       │   │   ├── automations.ts
│       │   │   ├── integrations.ts # + GET/PUT /settings/:key, POST /targetsms/test
│       │   │   ├── public/
│       │   │   │   └── leads.ts   # POST /api/leads — захват лидов, БЕЗ auth
│       │   │   └── webhooks/
│       │   │       ├── wazzup.ts  # Входящие события от WazzUp
│       │   │       ├── uis.ts     # Входящие события от UIS
│       │   │       └── payments.ts # Вебхуки оплат /cloudpayments и /robokassa
│       │   ├── services/
│       │   │   ├── automation/
│       │   │   │   └── engine.ts   # BullMQ-движок + timer-check джобы
│       │   │   ├── payments/       # Абстракция провайдеров: types, settings (кэш кредов),
│       │   │   │                   #   cloudpayments.ts, robokassa.ts, index.ts (getProvider)
│       │   │   ├── subscriptions/
│       │   │   │   └── index.ts    # createSubscription, chargeLesson, emitSubscriptionUpdated
│       │   │   ├── deals/
│       │   │   │   └── move-stage.ts # applyStageMove — системный перенос (вебхук оплаты)
│       │   │   ├── scheduled-messages/
│       │   │   │   └── worker.ts   # Отложенная отправка сообщений
│       │   │   ├── trial-reminders/
│       │   │   │   └── worker.ts   # Напоминания о пробных: delayed-джобы + sweep
│       │   │   ├── messaging/
│       │   │   │   ├── send.ts     # sendViaTransport: sms→TargetSMS, иначе WazzUp
│       │   │   │   └── sendToContact.ts # resolveRecipient + sendMessageToContact — общая немедленная
│       │   │   │                        #   отправка, переиспользуется deals.ts и chats.ts
│       │   │   ├── chats/
│       │   │   │   └── access.ts   # canViewContact — видимость чата по assigneeId сделок контакта
│       │   │   ├── sms/
│       │   │   │   └── client.ts   # TargetSMS API-клиент
│       │   │   ├── wazzup/
│       │   │   │   └── client.ts   # WazzUp API-клиент
│       │   │   ├── uis/
│       │   │   │   └── client.ts   # UIS API-клиент
│       │   │   ├── email/          # client.ts (SMTP+кэш кредов по accountId), imap-worker.ts (setInterval-поллинг,
│       │   │   │                   #   без BullMQ), match.ts (resolveContactByEmail), access.ts (owner/allowedUserIds)
│       │   │   └── storage/
│       │   │       └── s3.ts       # Универсальный S3-клиент для вложений (Yandex Object Storage/R2/MinIO)
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   └── validate.ts
│       │   ├── socket/
│       │   │   └── handlers.ts    # Socket.io события
│       │   └── lib/
│       │       ├── prisma.ts
│       │       ├── redis.ts
│       │       └── phone.ts       # phoneDigits/phoneCanonical (8→7, хранение +7…)
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── package.json
│
└── packages/
    └── shared/                 # Общие TypeScript-типы и константы
        └── src/
            ├── types/
            │   ├── deal.ts             # + lostReasonId/lostComment/closedAt, stage.type
            │   ├── pipeline.ts         # Stage (+type), StageType, LostReason
            │   ├── contact.ts
            │   ├── company.ts
            │   ├── task.ts
            │   ├── trial.ts            # TrialLesson, TrialRemindersSettings
            │   ├── subscription.ts     # Package, Subscription, Lesson, Payment
            │   ├── automation.ts       # TriggerType (+timer, trial_*, subscription_low_balance, payment_received)
            │   └── field-definition.ts
            └── constants/
                └── transports.ts       # TRANSPORT_LABELS/EMOJI, channelCanInitiate
```

---

## Схема базы данных (Prisma)

### Ключевые принципы
- **Кастомные поля** — хранятся в колонке `custom_fields JSONB` у каждой сущности. Схема полей (типы, названия, порядок) — в таблице `field_definitions`.
- **Изменение значений напрямую в БД** — достаточно обновить `custom_fields` JSON; при следующем рендере UI подхватит значения автоматически через схему из `field_definitions`.
- **Аудит** — все изменения логируются в `activities`.

### Основные модели
```prisma
model Pipeline {
  id          String   @id @default(cuid())
  name        String
  stages      Stage[]
  deals       Deal[]
  automations Automation[]
}

model Stage {
  id         String  @id @default(cuid())
  name       String
  color      String
  order      Int
  type       String  @default("open") // open | won | lost — основа конверсии в аналитике
  pipelineId String
  pipeline   Pipeline @relation(fields: [pipelineId], references: [id])
  deals      Deal[]
}

// Справочник причин потери; на причину ссылаются сделки — вместо удаления active=false
model LostReason {
  id     String  @id @default(cuid())
  name   String
  order  Int     @default(0)
  active Boolean @default(true)
  deals  Deal[]
}

model Deal {
  id            String   @id @default(cuid())
  title         String
  budget        Decimal?
  stageId       String
  stage         Stage    @relation(fields: [stageId], references: [id])
  pipelineId    String
  pipeline      Pipeline @relation(fields: [pipelineId], references: [id])
  assigneeId    String?
  assignee      User?    @relation(fields: [assigneeId], references: [id])
  contactId     String?
  contact       Contact? @relation(fields: [contactId], references: [id])
  companyId     String?
  company       Company? @relation(fields: [companyId], references: [id])
  custom_fields Json     @default("{}")   // JSONB — кастомные поля
  stageEnteredAt DateTime @default(now()) // снапшот входа в этап — guard timer-триггера
  lostReasonId  String?  // причина потери (обязательна при переносе в lost-этап)
  lostReason    LostReason? @relation(fields: [lostReasonId], references: [id], onDelete: SetNull)
  lostComment   String?
  closedAt      DateTime? // вход в won/lost этап; null у открытых (возврат в open очищает)
  deletedAt     DateTime? // мягкое удаление (корзина, 30 дней); есть также у Contact и Company
  tasks         Task[]
  activities    Activity[]
  messages      Message[]
  calls         Call[]
  trials        TrialLesson[]
  subscriptions Subscription[]
  payments      Payment[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// ==== Волна 1: абонементы и оплаты ====

// Справочник тарифов (настройки → Абонементы); при выставлении счёта менеджер может
// скорректировать цену/уроки — в Subscription/Payment уходят СНАПШОТЫ
model Package {
  id                    String  @id @default(cuid())
  name                  String
  lessonsCount          Int
  lessonDurationMinutes Int?    // длительность одного урока, мин (45/60); справочное — в снапшоты не копируется
  durationDays          Int?    // null = бессрочный
  price                 Decimal
  active                Boolean @default(true)
}

// Абонемент принадлежит КОНТАКТУ (ученику), помнит сделку-источник.
// Баланс = lessonsTotal - lessonsUsed (не хранится отдельно)
model Subscription {
  id           String    @id @default(cuid())
  contactId    String    // Contact, onDelete Cascade
  dealId       String?   // Deal-источник, SetNull
  packageId    String?   // Package, SetNull
  packageName  String    // снапшот
  lessonsTotal Int       // снапшот с учётом корректировки
  lessonsUsed  Int       @default(0)
  price        Decimal   // снапшот
  status       String    @default("active") // active | exhausted | expired | canceled; expired — лениво по expiresAt
  startsAt     DateTime  @default(now())
  expiresAt    DateTime?
  paymentId    String?   @unique // 1:1 с платежом — защита от дубля при повторном вебхуке
  lessons      Lesson[]
}

// Урок абонемента: completed И no_show списывают с баланса, canceled — нет
model Lesson {
  id             String   @id @default(cuid())
  subscriptionId String   // Cascade
  teacherId      String?  // User с role="teacher", SetNull
  scheduledAt    DateTime
  status         String   @default("scheduled") // scheduled | completed | canceled | no_show
  note           String?
}

// Счёт на оплату; invoiceId ЧИСЛОВОЙ (autoincrement) — требование Robokassa InvId
model Payment {
  id           String    @id @default(cuid())
  invoiceId    Int       @unique @default(autoincrement())
  dealId       String?   // SetNull
  contactId    String?   // SetNull
  packageId    String?   // SetNull
  packageName  String    // снапшот пакета с override
  lessonsTotal Int
  durationDays Int?
  amount       Decimal
  currency     String    @default("RUB")
  provider     String    // cloudpayments | robokassa
  status       String    @default("pending") // pending | succeeded | failed | canceled; succeeded ставит ТОЛЬКО вебхук
  paymentUrl   String?
  externalId   String?   // TransactionId CloudPayments
  paidAt       DateTime?
  rawWebhook   Json?
}

model TrialLesson {
  id                String   @id @default(cuid())
  dealId            String
  deal              Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  scheduledAt       DateTime
  status            String   @default("scheduled") // scheduled | completed | no_show | canceled
  reminderTransport String   // legacy: первый из reminderTargets (whatsapp | telegram | ... | sms)
  reminderChatId    String?  // legacy: первый chatId; для sms — телефон в цифрах
  reminderTargets   Json     @default("[]") // [{transport, chatId}] — ВСЕ получатели напоминаний
  remindersSent     Json     @default("[]") // отправленные офсеты (минуты) для ТЕКУЩЕГО scheduledAt
  createdById       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([dealId])
  @@index([status, scheduledAt])
}

model Contact {
  id               String   @id @default(cuid())
  name             String
  phone            String?  // основной телефон
  email            String?  // основной email
  telegramUsername String?
  wazzupChatId     String?
  wazzupChannel    String?
  companyId        String?
  company          Company? @relation(fields: [companyId], references: [id])
  custom_fields    Json     @default("{}")
  deals            Deal[]
  tasks            Task[]
  phones           ContactPhone[]   // доп. телефоны
  emails           ContactEmail[]   // доп. email-ы
  channels         ContactChannel[] // каналы мессенджеров {transport, chatId}
}

// Доп. телефоны/email контакта — CRUD: POST/DELETE /contacts/:id/phones[/:phoneId], /contacts/:id/emails[/:emailId]
model ContactPhone {
  id        String  @id @default(cuid())
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  phone     String
  label     String? @default("mobile")
}

model ContactEmail {
  id        String  @id @default(cuid())
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  email     String
  label     String?
}

model Company {
  id            String    @id @default(cuid())
  name          String
  custom_fields Json      @default("{}")
  contacts      Contact[]
  deals         Deal[]
}

model Task {
  id          String    @id @default(cuid())
  title       String
  description String?
  dueDate     DateTime?
  completed   Boolean   @default(false)
  dealId      String?
  deal        Deal?     @relation(fields: [dealId], references: [id])
  contactId   String?
  contact     Contact?  @relation(fields: [contactId], references: [id])
  assigneeId  String
  assignee    User      @relation(fields: [assigneeId], references: [id])
}

model FieldDefinition {
  id                 String   @id @default(cuid())
  entityType         String   // "deal" | "contact" | "company"
  key                String   // ключ в JSONB (напр. "student_level")
  label              String   // отображаемое название
  fieldType          String   // "text" | "number" | "select" | "date" | "checkbox" | "multiselect"
  options            Json?    // для select/multiselect: [{value, label}]
  order              Int      @default(0)
  required           Boolean  @default(false)
  requiredAtStageIds String[] @default([])  // поле обязательно при переходе в ЛЮБОЙ из этих этапов
  pipelineId         String?  // null = глобальное поле для всех воронок
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([entityType, key, pipelineId])
}

model Automation {
  id          String   @id @default(cuid())
  name        String
  pipelineId  String
  pipeline    Pipeline @relation(fields: [pipelineId], references: [id])
  trigger     Json     // {type: "stage_change"|"field_change"|"webhook", config: {...}}
  actions     Json     // [{type: "create_task"|"send_message"|"change_field", config: {...}}]
  active      Boolean  @default(true)
}

model Activity {
  id         String   @id @default(cuid())
  dealId     String?
  deal       Deal?    @relation(fields: [dealId], references: [id])
  userId     String?
  type       String   // "stage_change" | "note" | "call" | "message" | "field_change"
  payload    Json
  createdAt  DateTime @default(now())
}

model Message {
  id          String    @id @default(cuid())
  dealId      String?
  deal        Deal?     @relation(fields: [dealId], references: [id])
  contactId   String?
  wazzupId    String?   @unique
  channel     String    // "whatsapp" | "telegram" | "instagram" | ... | "email"
  direction   String    // "in" | "out"
  content     String
  status      String    @default("sent")  // "scheduled"|"sending"|"sent"|"error"|"delivered"|"read"
  errorMsg    String?   // заполняется при status="error"
  scheduledAt DateTime? // заполняется для отложенных сообщений
  createdAt   DateTime  @default(now())

  // Email (channel: "email") — переиспользует эту же модель вместо отдельной сущности
  subject        String?
  bodyHtml       String?
  toAddresses    String[]      @default([])
  ccAddresses    String[]      @default([])
  emailMessageId String?       @unique // RFC822 Message-ID — идемпотентность приёма, как wazzupId
  emailInReplyTo String?
  threadKey      String?       // группировка для «Почты»: contactId либо email внешней стороны
  readAt         DateTime?     // непрочитанные в разделе «Почта»
  emailAccountId String?
  emailAccount   EmailAccount? @relation(fields: [emailAccountId], references: [id], onDelete: SetNull)
  attachments    Attachment[]
}

// SMTP/IMAP-ящик: общий (владелец = любой юзер) или личный + явный список допущенных
model EmailAccount {
  id              String    @id @default(cuid())
  label           String
  emailAddress    String
  smtpHost        String
  smtpPort        Int
  smtpUser        String
  smtpPassword    String
  imapHost        String
  imapPort        Int
  imapUser        String
  imapPassword    String
  ownerId         String
  owner           User      @relation("EmailAccountOwner", fields: [ownerId], references: [id])
  allowedUserIds  String[]  @default([]) // кому ещё, кроме owner/admin, разрешено отправлять
  active          Boolean   @default(true)
  imapUidValidity BigInt?   // UIDVALIDITY 32-бит unsigned — не влезает в Int4, поэтому BigInt
  lastImapUid     Int       @default(0) // чекпоинт последнего обработанного UID (imapflow отдаёт uid как number)
  lastPolledAt    DateTime?
  lastError       String?
  messages        Message[]
}

model Attachment {
  id         String   @id @default(cuid())
  messageId  String
  message    Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  filename   String
  mimeType   String
  size       Int
  storageKey String // ключ объекта в S3-совместимом хранилище (services/storage/s3.ts)
}

model Call {
  id          String   @id @default(cuid())
  dealId      String?
  deal        Deal?    @relation(fields: [dealId], references: [id])
  uisCallId   String?  @unique
  direction   String   // "in" | "out"
  duration    Int?     // секунды
  recordUrl   String?
  createdAt   DateTime @default(now())
}

// Роль с матрицей прав (ключи — PermissionKey из packages/shared/src/constants/permissions.ts).
// 3 системные роли (admin/manager/teacher) созданы миграцией с фиксированными id
// (role_admin_system и т.д.); isSystem-роли нельзя удалить/переименовать, admin — вообще не менять
// (его права даются из кода: ALL_PERMISSIONS, БД — только для отображения).
model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  permissions String[] @default([])
  isSystem    Boolean  @default(false)
  users       User[]
}

model User {
  id        String  @id @default(cuid())
  email     String  @unique
  name      String
  roleId    String
  role      Role    @relation(fields: [roleId], references: [id]) // строковая колонка role удалена (июль 2026)
  active    Boolean @default(true) // false = вход/refresh заблокированы (деактивация вместо удаления — FK от сделок/задач)
  passwordHash String
  deals     Deal[]
  tasks     Task[]
}

model IntegrationSetting {
  id      String @id @default(cuid())
  key     String @unique  // "wazzup_api_key" | "uis_key" | "uis_secret"
  value   String
}
```

---

## Ключевые архитектурные решения

### 1. Кастомные поля через JSONB
Схема хранится в `field_definitions`, значения — в `custom_fields` JSONB. Это позволяет:
- **Напрямую редактировать данные в PostgreSQL** (`UPDATE deals SET custom_fields = custom_fields || '{"level":"B2"}'`) — интерфейс отобразит изменения автоматически
- Не тратить API-запросы на массовое редактирование
- Добавлять новые поля без миграций

### 2. Автоматизации через BullMQ
При наступлении события (смена этапа, изменение поля, входящий webhook):
1. Express-роут / Socket.io пишет событие в Redis-очередь BullMQ
2. Worker читает событие, находит подходящие `Automation` по `pipelineId` + `trigger.type`
3. Выполняет `actions` последовательно (создать задачу, отправить сообщение в WazzUp и т.д.)

### 3. Реалтайм через Socket.io
- При drag-and-drop сделки: оптимистичное обновление на клиенте → API-запрос → `DEAL_MOVED` событие всем в комнате `pipeline:{id}`
- При входящем сообщении WazzUp: backend эмитит `NEW_MESSAGE` → уведомление в карточке сделки

### 4. WazzUp интеграция
- **Входящие:** webhook `POST /api/webhooks/wazzup` → сохранить в `messages`, найти/создать deal, уведомить через Socket.io
- **Исходящие:** `POST https://api.wazzup24.com/v3/message` через WazzUp API-клиент (`services/wazzup/client.ts`)
- **Отложенная отправка:** `POST /deals/:id/messages` с `scheduledAt` → BullMQ delayed job (`services/scheduled-messages/worker.ts`)
- **Редактирование:** `PATCH /deals/:id/messages/:messageId` → `PATCH https://api.wazzup24.com/v3/message`
- **Статусы реалтайм:** `MESSAGE_STATUS` и `MESSAGE_EDITED` эмитятся в ОБЕ комнаты: `pipeline:{pipelineId}` и `deal:{dealId}`
- Виджет диалога встроен в карточку сделки (DealModal), вкладка «Сообщения»
- Каналы синхронизируются из WazzUp в `IntegrationSetting` (key: `wazzup_channels`); `canInitiate` не хранится — определяется по транспорту и `plainId` (см. замечание 14)
- Настройка каналов: `/settings/wazzup`

### 5. UIS телефония
- **Входящие:** webhook `POST /api/webhooks/uis` → сохранить в `calls`, привязать к deal по номеру телефона
- **Исходящие (НЕ реализовано):** план — кнопка "Позвонить" → `POST /api/calls/initiate` → UIS Click-to-call API; `uisClient.initiateCall()` написан, но роута и кнопки нет
- Запись разговора — ссылка в `calls.recordUrl`, проигрывается в карточке

---

## Канбан-доска: детали реализации

```
KanbanBoard
├── Получает pipeline + stages + deals через TanStack Query
├── DragDropContext (@dnd-kit)
│   └── KanbanColumn (per stage)
│       ├── Header (название, счётчик, сумма бюджета)
│       └── DealCard[]
│           ├── Название, ответственный, контакт
│           ├── Срок следующей задачи
│           ├── Иконки: сообщение (WazzUp), звонок (UIS)
│           └── onClick → window.open('/deals/{id}', '_blank') — карточка на весь экран в новой вкладке
│
DealDetail (рендерится в deals/[id]/page.tsx, полноэкранная страница внутри дашборд-лейаута)
    ├── Заголовок: стрелка «Назад» (→ /deals) + инлайн-редактируемое название + «Сохранить/Отменить»
    │             ПРЯМО В ШАПКЕ рядом с названием (дублирует нижний saveBar, чтобы не листать
    │             карточку вниз при правке)
    ├── Основные поля (название, бюджет, ответственный, этап)
    ├── Контакт: если привязан — ContactInlineCard (просмотр + inline-редактирование
    │            имени/телефона/email/telegram, добавление/удаление доп. телефонов И доп. email-ов);
    │            если НЕ привязан — AttachContactCard (найти и привязать существующий контакт
    │            поиском по имени ИЛИ создать нового прямо из карточки) — привязка идёт через
    │            обычный `PATCH /api/deals/:id {contactId}`, отдельного роута нет
    ├── Пробный урок (TrialLessonCard — запись/перенос/результат, каналы напоминаний чекбоксами)
    ├── Вкладки: Основное | Доп. инфо | Задачи | Сообщения | Звонки | Активность
    │   ├── Доп. инфо: кастомные поля (CustomFieldsRenderer — рендерит по FieldDefinition[]);
    │   │             сохраняются общей мутацией с основными полями, поэтому панель
    │   │             «Сохранить/Отменить» (saveBar) рендерится и на «Основном», и на «Доп. инфо»
    │   └── Задачи: создание, inline-редактирование (название/срок/ответственный),
    │             toggle выполнения в обе стороны, удаление
    └── Связи: контакт, компания
```

При перетаскивании карточки:
1. Оптимистичное обновление локального стейта (Zustand/TanStack Query `setQueryData`)
2. `PATCH /api/deals/:id/stage` → обновить `stageId` в БД
3. Запустить автоматизации через BullMQ
4. Сокет-событие `DEAL_MOVED` остальным пользователям

---

## Раздел аналитики

Метрики для руководителя:
- **Воронка (Funnel):** количество и сумма сделок по этапам
- **Конверсия:** % сделок переходящих из этапа в этап
- **Новые сделки / закрытые** — за период (день/неделя/месяц)
- **Выручка** — закрытые сделки с суммой
- **Топ менеджеров** — по количеству закрытых сделок
- **Среднее время** в каждом этапе воронки
- **Активность** — звонки, сообщения, задачи за период

Данные: SQL-запросы к PostgreSQL через Prisma (агрегации). Кэш в Redis на 5 минут.

### Конверсии, retention, источники (A7, частично, июль 2026)

`GET /api/analytics/pipeline/:id` отдаёт `funnel` (накопительная воронка по этапам),
`summary.trials.trialToPaymentRate` (конверсия пробный→оплата) — см. замечание 64 — и
`summary.retention` (LTV/renewal rate/churn) + `utmSources` (объём/конверсия/выручка по
`custom_fields.utm_source`) — см. замечание 65. Осталось из A7: выручка по языкам/преподавателям
(нет поля «язык»).

---

## Настройки автоматизаций (UI)

Раздел `Settings > Automations`:
```
Для каждого этапа воронки:
┌─────────────────────────────────────────────┐
│  Этап: "Новый лид"                          │
│  + Добавить автоматизацию                   │
│                                             │
│  ✓ [Триггер: Сделка вошла в этап]           │
│    → Создать задачу: "Позвонить клиенту"    │
│      Срок: через 1 час                      │
│      Ответственный: Менеджер сделки         │
│                                             │
│  ✓ [Триггер: Webhook от WazzUp]             │
│    → Отправить сообщение в WhatsApp:        │
│      "Здравствуйте! Ваша заявка получена"   │
└─────────────────────────────────────────────┘
```

Триггеры: `stage_enter`, `stage_leave`, `field_change`, `webhook`, `timer`, `trial_booked`, `trial_completed`, `trial_no_show`, `subscription_low_balance` (порог `threshold`, дефолт 2), `payment_received`
Действия: `create_task`, `send_wazzup_message`, `change_field`, `move_stage`, `notify_user`

Статус: ✅ ГОТОВО (июль 2026). Движок (BullMQ) и CRUD-API рабочие, все действия и триггеры
реализованы; UI-конструктор — `components/automation/AutomationDialog.tsx`, один диалог на
создание и редактирование, вызывается со страницы `settings/automations/page.tsx` (кнопка
«Добавить» и клик по карточке). Динамические поля триггера/действия — свитч по `type`, как в
`CustomFieldsRenderer.tsx`; клиентская валидация обязательных-по-типу полей (бэкенд-схемы плоские
и permissive, ничего не требуют на уровне Zod) — кнопка сохранения задизейблена, пока не заполнены
`delayHours` для `timer`, `message` для `send_wazzup_message`, `fieldKey`/`fieldValue` для
`change_field`, `stageId` для `move_stage`, `userId` для `notify_user`. `move_stage` даёт выбрать
этап любой воронки (`<optgroup>` по pipeline) — движок поддерживает кросс-воронковый перенос.
Переупорядочивание действий — кнопки вверх/вниз, без drag-and-drop.

---

## Пробные уроки + захват лидов (Волна 2)

### Пробный урок (модель `TrialLesson`)
- Запись из DealModal (`components/deal/TrialLessonCard.tsx`): дата + **чекбоксы каналов напоминаний** (можно несколько одновременно): каналы контакта из `ContactChannel` + WhatsApp и SMS по КАЖДОМУ телефону (основной + `ContactPhone`). Один активный (`scheduled`) урок на сделку — роут возвращает 409.
- Каналы хранятся в `reminderTargets` (json `[{transport, chatId}]`); legacy-поля `reminderTransport/reminderChatId` заполняются первым target-ом для обратной совместимости (старые записи без targets читаются через fallback `trialReminderTargets()`).
- API: `POST /api/deals/:id/trials` (`{scheduledAt, reminderTargets}`; legacy-форма с одним `reminderTransport` тоже принимается — chatId резолвится на сервере), `PATCH /api/trials/:id` (`{scheduledAt}` = перенос со сбросом напоминаний, `{reminderTargets}` = смена каналов БЕЗ перепланирования джобов — воркер перечитывает урок из БД в момент отправки, `{status: completed|no_show|canceled}` = результат; scheduledAt+reminderTargets можно вместе, status — только отдельно). Socket-событие `TRIAL_UPDATED` в комнаты pipeline/deal.
- У активного урока в UI кнопка «Каналы» — редактирование каналов напоминаний после создания.
- Триггеры автоматизаций: `trial_booked`, `trial_completed`, `trial_no_show` (для `canceled` триггера нет).
- Аналитика: `summary.trials {booked, completed, noShow, showRate}` в `/api/analytics/pipeline/:id`; фильтр периода — по `scheduledAt`.

### Напоминания (`services/trial-reminders/worker.ts`, очередь `trial-reminders`)
- Настройка: `/settings/trials` → `IntegrationSetting` key `trial_reminders` (`{offsets:[{minutes, template}]}`, дефолт 1440/60 в коде). Плейсхолдеры `{имя} {дата} {время}` рендерятся в момент отправки в таймзоне `SCHOOL_TZ` (дефолт Europe/Moscow) — НЕ в UTC сервера.
- Механика: delayed-джобы с детерминированным jobId `trial_{id}_{offset}_{ts}` (отмена O(1) через `queue.remove`; БЕЗ двоеточий — `:` разделитель ключей BullMQ) + guard-ы в воркере (status/scheduledAt-снапшот/уже отправлен/урок в прошлом).
- Отправка идёт по ВСЕМ `reminderTargets` урока: офсет клеймится один раз, по каждому каналу пишется отдельный Message (sent/error) в ленту; офсет возвращается для ретрая ТОЛЬКО если не отработал ни один канал (иначе retry задублировал бы успешные).
- **Очереди — вне критического пути HTTP** (см. замечание 33): роуты сначала пишут в Postgres и отвечают, `scheduleTrialReminders`/`cancelTrialReminders` вызываются fire-and-forget; pre-claim прошедших офсетов внутри `scheduleTrialReminders` идёт ДО постановки джобов, чтобы успеть раньше sweep даже при зависшем Redis.
- **Источник истины — Postgres, не Redis**: поле `remindersSent` (jsonb, отправленные офсеты) + reconciliation-sweep каждые 5 мин и при старте догоняет пропущенное (рестарт контейнера, потеря ключей Redis). Клейм офсета — атомарный raw-SQL UPDATE c `@>`-проверкой; при ошибке отправки офсет возвращается и BullMQ ретраит (каждая попытка пишет error-Message в ленту).
- Офсеты, чей момент уже прошёл при записи «впритык», помечаются отправленными сразу — иначе sweep разослал бы их с неверным текстом.
- Контейнеры работают постоянно и не засыпают — sweep нужен как страховка на случай рестарта
  контейнера или потери ключей Redis, а не как борьба со сном воркера.

### SMS — TargetSMS (`services/sms/client.ts`)
- JSON API `https://sms.targetsms.ru/sendsmsjson.php`; креды в `IntegrationSetting` (`targetsms_login|password|sender`), настройка на `/settings/sms` (пароль write-only, GET отдаёт только `hasValue`). Кэш кредов 60с, сбрасывается при PUT настроек.
- Единый диспетчер `services/messaging/send.ts` → `sendViaTransport({transport, chatId, text})`: `sms` → TargetSMS, остальное → WazzUp; «тихий» null от WazzUp превращается в throw.
- Исходящие SMS и напоминания пишутся в `Message` (`channel: 'sms'` и т.п.) — видны в ленте сделки.

### Timer-триггер (engine.ts)
- «Сделка в этапе дольше N часов»: при `stage_enter` для активных автоматизаций `{type:'timer', stageId?, delayHours}` ставится delayed-джоб `timer-check` в очередь `automations` (jobId `timer_{autoId}_{dealId}_{ts}`); при исполнении сделка и автоматизация перечитываются из БД, guard по `stageId` + снапшоту `Deal.stageEnteredAt` отсекает «ушёл и вернулся».
- `Deal.stageEnteredAt` обновляется в `PATCH /:id/stage` и в действии `move_stage`.
- `move_stage` теперь эмитит каскадный `stage_enter` с hop-счётчиком (лимит 3 — защита от цикла двух автоматизаций) и обновляет `pipelineId` по целевому этапу.
- `send_wazzup_message` резолвит канал через `ContactChannel` (+ опциональный `action.transport`, включая `'sms'`), а не только legacy `wazzupChannel`; создаёт `Message` и эмитит `NEW_MESSAGE`.

### Захват лидов (`routes/public/leads.ts`, без auth)
- `POST /api/leads`: body `{name, phone, email?, language?, comment?, utm_*, form_key?}`; ключ — заголовок `X-Form-Key` или `form_key`, сверка `timingSafeEqual` с `lead_form.secret` из `IntegrationSetting`. Настройка (воронка/этап/ключ + пример curl) — `/settings/lead-form`.
- **Роутер-level `cors({origin:true})`** — глобальный CORS-whitelist зарезал бы браузерные POST с лендингов. Rate limit 30/мин на IP; для этого в `index.ts` добавлен `app.set('trust proxy', 1)`.
- Телефон нормализуется через `lib/phone.ts` (`phoneDigits`/`phoneCanonical`: 8→7, хранение `+7…`); контакт ищется и по `Contact.phone`, и по `ContactPhone` — дублей не создаётся, повторная заявка = новая сделка (`payload.repeat: true` в Activity `lead_captured`). UTM/language/comment → `custom_fields` сделки. Автоответ — обычной автоматизацией `stage_enter`.
- Наружу отдаётся только `{ok: true}` — без внутренних id.

### Общее
- Словари транспортов (`TRANSPORT_LABELS/EMOJI`, `channelCanInitiate`) — в `packages/shared/src/constants/transports.ts` (включая `vk`, `sms`); локальные копии в компонентах удалены. После изменения shared — `npm run build` в `packages/shared`.
- Generic-настройки: `GET/PUT /api/integrations/settings/:key` (allowlist ключей; PUT admin-only; `lead_form` читают только админы). Тест SMS: `POST /api/integrations/targetsms/test` → баланс.

---

## Деньги: won/lost, абонементы, оплаты (Волна 1, июль 2026)

### B1. Типы этапов + причины потери
- `Stage.type: open|won|lost` (селектор в настройках воронки, бейджи в списке этапов). Миграция бэкфиллит последний по `order` этап каждой воронки как `won` — прежняя семантика аналитики сохранена.
- Перенос в lost-этап требует причину: `PATCH /deals/:id/stage {stageId, lostReasonId?, lostComment?}` → `422 {error:'lost_reason_required'}` без неё. Диалог (`LostReasonDialog`) открывается при drop в lost-колонку канбана (перенос отложен до подтверждения; отмена → invalidate `['kanban']` откатывает оптимистичное перемещение) и при смене этапа из DealModal.
- `Deal.closedAt` ставится при входе в won/lost; возврат в open очищает `closedAt`+причину. `move_stage` из автоматизаций причину НЕ спрашивает (ставит только closedAt) — не таргетируйте lost-этапы автоматизациями, если важна аналитика по причинам.
- Причины — `/api/lost-reasons` (мутации admin); удаление при наличии сделок → 409, вместо этого `active=false`. UI — секция на `/settings/pipeline`.
- Аналитика: `wonDeals`/`lostDeals`/`winRate` по `stage.type` (старый `closedDeals` остался алиасом wonDeals), разбивка `lostReasons: [{id,name,count}]`.

### A1. Абонементы (Package / Subscription / Lesson)
- Справочник пакетов `/settings/packages` (`/api/packages`, мутации admin). У пакета — число уроков, длительность одного урока в минутах (`lessonDurationMinutes`, опционально, показывается в селектах пакета и списке настроек), срок действия в днях, цена. Подписка у **контакта** со ссылкой на сделку-источник; при создании (ручном или по оплате) снапшотятся `packageName/lessonsTotal/price` — с ручной корректировкой.
- `/api/subscriptions`: `POST` (ручное создание — наличные/перевод), `PATCH /:id` (отмена/корректировка lessonsTotal с пересчётом exhausted), `POST /:id/lessons`, `PATCH /:id/lessons/:lessonId`.
- **Списание**: `completed` и `no_show` списывают урок, `canceled` — нет. Транзакция `lesson.updateMany({where: {status:'scheduled'}}) + increment lessonsUsed` — двойной клик даёт 0 строк → 409. Баланс 0 → `exhausted`; `expired` вычисляется лениво по `expiresAt` (крона нет), поле `effectiveStatus` в ответах API.
- Триггер `subscription_low_balance`: эмитится после КАЖДОГО списания с `remaining`, матчинг в движке по **точному равенству** `remaining === threshold` — срабатывает ровно один раз при пересечении порога, без хранения флагов. Ручная корректировка, перепрыгивающая порог, событие не даёт.
- UI: `SubscriptionCard` (баланс красным при ≤2, разворачиваемые уроки, преподаватель — селект юзеров `role='teacher'`) в DealModal и на странице контакта. Сокет `SUBSCRIPTION_UPDATED` в комнаты deal/pipeline.

### A3. Платёжные ссылки + вебхук оплаты (`services/payments/`)
- Абстракция `PaymentProvider {createLink, handleWebhook}`; вебхук-результат несёт **свой формат подтверждения** (`ack`): CloudPayments — `200 {"code":0}`, Робокасса — `text OK{InvId}`. `getProvider(name)`, креды из IntegrationSetting с кэшем 60с (`invalidatePaymentSettingsCache()` в PUT настроек).
- **CloudPayments**: счёт через `POST api.cloudpayments.ru/orders/create` (Basic `PublicId:ApiSecret`) → `Model.Url`; Pay-вебхук — HMAC-SHA256 **от сырого тела** base64 в `Content-HMAC`, тело по умолчанию **form-urlencoded**.
- **Робокасса**: ссылка собирается локально (без HTTP) с `MD5(Login:OutSum:InvId:Password1)`; ResultURL — `MD5(OutSum:InvId:Password2)` регистронезависимо; `IsTest=1` через чекбокс настроек. `Payment.invoiceId Int autoincrement` — InvId строго числовой; подпись считается от той же строки OutSum (`"1234.00"`), что в URL.
- Флоу: «Выставить счёт» в SubscriptionCard → `InvoiceDialog` (пакет → префилл суммы/уроков, редактируемые; провайдер — из настройки `payments.defaultProvider`) → `POST /api/payments` создаёт pending + ссылку (ошибка провайдера → status failed + 502) → «Копировать» / отправка клиенту.
- **Отправка клиенту — вариативная** (июль 2026): после создания счёта показывается пикер каналов (`lib/channelOptions.ts` — те же WhatsApp/SMS-по-каждому-телефону + каналы переписки, что и в TrialLessonCard) и редактируемый `<textarea>` с текстом, предзаполненным по шаблону `payments.invoiceMessageTemplate` (плейсхолдеры `{имя} {пакет} {сумма} {ссылка}`, рендер — `lib/invoiceTemplate.ts`). Дефолтный шаблон в `DEFAULT_INVOICE_MESSAGE_TEMPLATE`, если в настройках свой не задан. Менеджер может выбрать канал/номер и переписать текст перед отправкой — уходит тем же `POST /deals/:id/messages`, но уже с явными `transport`/`chatId` вместо угадывания на бэкенде.
- Шаблон настраивается на `/settings/payments` (секция «Общее», под картой этапов после оплаты).
- Вебхук `POST /api/webhooks/payments/{cloudpayments|robokassa}`: подпись → платёж по invoiceId (не найден → **ack**, чтобы провайдер не ретраил чужое) → расхождение суммы = warning-лог, не блокирует → **идемпотентный переход** `updateMany({where: {status:'pending'}})` (повтор/отменённый → ack без эффектов) → создание подписки из снапшота платежа (`@unique Subscription.paymentId` — вторая линия защиты от дубля) → Activity `payment_received` → сокет `PAYMENT_RECEIVED` → триггер `payment_received` → автоперенос.
- **Автоперенос в «Оплачено»**: `payments.paidStageMap[pipelineId]` из настроек → иначе первый (min order) won-этап воронки → иначе не двигать. Если сделка уже в won-этапе — не трогаем (гонка с ручным переносом). Перенос — через `applyStageMove()` (`services/deals/move-stage.ts`): системный, БЕЗ проверки обязательных полей и причины потери, с каскадным stage_enter (hop-limit 3) и DEAL_MOVED.
- Настройки `/settings/payments`: секции CloudPayments/Робокасса (секреты write-only — GET отдаёт `hasValue`), провайдер по умолчанию, этап после оплаты по воронкам, шаблон сообщения со ссылкой на оплату, URL вебхуков для ЛК провайдеров.
- Ключи IntegrationSetting: `payments` (JSON `{defaultProvider, robokassaTestMode, paidStageMap, invoiceMessageTemplate}`), `cloudpayments_public_id|api_secret`, `robokassa_login|password1|password2`.

---

## Корзина: мягкое удаление сделок/контактов/компаний (июль 2026)

- `deletedAt DateTime?` у Deal/Contact/Company; все списки, канбан, аналитика, вебхуки (WazzUp/UIS) и захват лидов фильтруют `deletedAt: null`. Удалённый контакт при входящем сообщении/заявке НЕ матчится — создаётся новый.
- **Права**: удаление (даже в корзину), восстановление и «удалить навсегда» — только `admin` (`requireRole`); менеджеры кнопок не видят. `DELETE /api/deals|contacts|companies/:id` — теперь soft-delete.
- **Связи**: при удалении контакта/компании их сделки ОСТАЮТСЯ в воронке со связью; в DealModal у контакта из корзины бейдж «в корзине» (contact.deletedAt в dealInclude).
- **Корзина** `/trash` (страница + пункт сайдбара для админа): `GET /api/trash`, `POST /api/trash/{deals|contacts|companies}/:id/restore`, `DELETE /api/trash/{...}/:id` (стирает навсегда; активные записи не берёт — guard `deletedAt != null` через updateMany/deleteMany, 0 строк → 404). Restore сделки эмитит `DEAL_CREATED`; удаление — `DEAL_DELETED` (KanbanBoard слушает оба).
- **Автоочистка 30 дней**: `purgeExpiredTrash()` в `routes/trash.ts` — при старте API + `setInterval` 12 ч (без Redis/BullMQ — на VPS собственный Redis без лимита команд, но джоба и так тривиальная, отдельная очередь ради нее была бы лишней). Контейнер API работает постоянно, прогон при старте догоняет пропущенное только после реального рестарта/деплоя.
- После сохранения сделки DealModal больше НЕ закрывается — родители (KanbanBoard, deals/page, contacts/[id]) не зовут close в `onUpdated`.

---

## UX-доработки DealModal + вариативная отправка счёта (июль 2026)

- **Привязка контакта в любой момент**: если у сделки нет контакта, вместо заглушки в DealModal рендерится `AttachContactCard` — поиск существующего контакта (`contactsApi.list({search})`) или создание нового прямо из карточки, с последующим `PATCH /api/deals/:id {contactId}`. Отдельного бэкенд-роута не потребовалось — `contactId` уже принимался этим эндпоинтом, не хватало только UI.
- **Save/Cancel в шапке**: `handleSave`/`handleCancel` вынесены в переиспользуемые функции DealModal и вызываются И из кнопок в шапке рядом с названием (видны при `isDirty` без скролла), И из нижнего `saveBar` на вкладках «Основное»/«Доп. инфо» — это один и тот же стейт, дублируются только кнопки.
- **Вариативная отправка счёта**: логика подбора каналов (WhatsApp/SMS по каждому телефону контакта + существующие каналы переписки) вынесена из `TrialLessonCard` в `lib/channelOptions.ts`, чтобы её переиспользовал `InvoiceDialog`. После создания счёта менеджер выбирает канал и правит текст (предзаполнен шаблоном из `/settings/payments`, `lib/invoiceTemplate.ts`) перед отправкой.
- См. также замечание 42.

## Email-канал (SMTP/IMAP), июль 2026

Второй канал переписки после WazzUp — переиспользует модель `Message` (`channel: 'email'`) вместо отдельной
сущности, поэтому лента переписки в DealModal и вся сокет-инфраструктура (`NEW_MESSAGE`/`MESSAGE_STATUS`)
достаются бесплатно. OAuth-вход (Яндекс/Google/Mail.ru) — НЕ реализован, только прямой SMTP/IMAP.

### Почтовые ящики (`EmailAccount`)
- Общие ИЛИ личные — модель одна: `ownerId` (владелец) + `allowedUserIds` (доп. допущенные, как
  `FieldDefinition.requiredAtStageIds` — массив без join-таблицы). Admin видит и использует все ящики;
  остальные — только свои (owner) и те, куда явно добавлены.
- CRUD только `admin` (`/settings/email`, роуты `email-accounts.ts`); пароли write-only (GET отдаёт
  `smtpPasswordSet`/`imapPasswordSet`, пустая строка при PATCH = не менять — как `targetsms_password`).
- «Проверить подключение» — `POST /email-accounts/:id/test`: реальный SMTP `transporter.verify()` +
  пробный IMAP `connect()`/`logout()` через `imapflow`.

### Отправка (`services/email/client.ts`)
- `sendEmailMessage()` — отдельная функция, НЕ через общий `sendViaTransport({transport,chatId,text})`:
  сигнатура email (subject, attachments, выбор аккаунта) не ложится в этот шейп. Кэш кредов по `accountId`
  (TTL 60с, как у `TargetSmsClient`), `invalidateCache(accountId)` при PATCH аккаунта.
- Интерактивная отправка (`POST /deals/:id/emails`, `POST /email/compose`) — `multer` memory storage,
  вложения при наличии S3-конфига грузятся в объектное хранилище, `Message` создаётся сразу со
  `status: 'sending'`, реальная отправка — fire-and-forget промис (обновляет `status/emailMessageId/errorMsg`
  по завершении, эмитит `MESSAGE_STATUS`) — та же схема, что и `wazzupClient.sendMessage` в `deals.ts`.

### Приём — IMAP-поллинг (`services/email/imap-worker.ts`)
- **Без BullMQ/Redis** — обычный `setInterval` (`EMAIL_POLL_INTERVAL_MS`, дефолт 120000мс) + первый прогон
  через `setTimeout` 10с после старта. Опрос IMAP не нуждается в отложенных джобах — заводить ради
  него четвёртую BullMQ-очередь было бы лишним.
- Чекпоинт на аккаунт: `lastImapUid` (Int — imapflow отдаёт per-message UID как `number`) + `imapUidValidity`
  (**BigInt**, не Int — UIDVALIDITY 32-битный unsigned, может превышать `Int4`). Расхождение `uidValidity`
  между опросами = ящик пересоздан на сервере → сброс `lastImapUid` в 0.
- Парсинг — `mailparser.simpleParser(source)` на сырые байты письма (не IMAP envelope) — так разом достаются
  `messageId/inReplyTo/references/from/to/cc/subject/text/html/attachments`.
- **Матчинг** (аналог `handleStatusEntry`/матчинга контакта в вебхуке WazzUp): 1) точный тред — если
  `inReplyTo`/последний `references` совпадает с уже сохранённым `Message.emailMessageId`, берём его
  `dealId/contactId/threadKey`; 2) иначе контакт по `from`-адресу (`Contact.email` ИЛИ `ContactEmail.email`,
  регистронезависимо, `deletedAt: null`) → сделка = самая недавно обновлённая недалённая сделка контакта;
  3) контакт не найден → `Message` всё равно создаётся (`dealId=null, contactId=null`), видна только в общем
  инбоксе «Почта» — **авто-создания сделки/лида по входящему письму НЕТ** (сознательное решение, в отличие от
  лид-формы A6).
- Идемпотентность повторного прогона — `Message.emailMessageId @unique` (как `wazzupId` у WazzUp).
- Сбой одного ящика (неверные креды, недоступен сервер) — try/catch на уровне аккаунта, не блокирует опрос
  остальных; ошибка пишется в `EmailAccount.lastError`.

### Единый инбокс «Почта» (`/email`, роуты `routes/email.ts`)
- Группировка тредов — `threadKey` (contactId при известном контакте, иначе email внешней стороны в нижнем
  регистре), проставляется в момент создания `Message` (и при отправке, и при приёме), а не вычисляется на
  лету. Список тредов — `prisma.message.findMany({distinct:['threadKey'], orderBy:{createdAt:'desc'}})`:
  Prisma-паттерн «последняя строка на группу» через `distinct`+`orderBy`, без ручного `groupBy`+подзапросов.
- Непрочитанные — поле `Message.readAt` (только для входящих email), проставляется при открытии треда
  (`GET /threads/:threadKey`); счётчик на тред — отдельный `groupBy` по `threadKey` с `readAt: null`.
- Доступность тредов/аккаунтов пользователю — `services/email/access.ts` (`canAccessAccount`,
  `getAccessibleAccountIds`), переиспользуется в `email.ts`, `email-accounts.ts`, `deals.ts`.
- Реалтайм — комната `email:inbox` (`join:email`/`leave:email` в `socket/handlers.ts`, как `join:pipeline`),
  событие `NEW_EMAIL`.

### Написать через email (в карточке сделки)
- **Первый контакт** (кнопка «Написать», `NewMessageDialog.tsx`): `email` появляется в списке транспортов,
  если у контакта есть хотя бы один адрес (`lib/channelOptions.ts` → `emailOptions()`, основной `email` +
  все `ContactEmail`) И у юзера есть доступ хотя бы к одному активному `EmailAccount`. Показывает выбор
  адреса получателя, ящика-отправителя (если доступно >1), обязательную тему, вложения.
- **Дальнейшая переписка** (вкладка «Сообщения», `MessagesTab` в `DealModal.tsx`): в `sendableChannels`
  добавляется ОДНА email-опция (первый доступный адрес контакта) — в отличие от мессенджеров, где опция
  всего одна на транспорт по конструкции `ContactChannel` (unique по `contactId+transport`), для email это
  сознательное упрощение: смена адреса получателя — через полный диалог «Написать», инлайн-композер всегда
  отвечает на тот же адрес, что и предыдущее письмо.
- Рендер письма в ленте — жирный `subject` + список вложений (кнопка со signed download URL,
  `GET /email/attachments/:id/download`); **HTML-тело писем НЕ рендерится как raw HTML** (санитайзера в
  проекте нет, риск XSS) — везде только текстовая версия.

### Вложения (`services/storage/s3.ts`)
- Универсальный S3-совместимый клиент (Yandex Object Storage/R2/MinIO/AWS — не завязан на провайдера),
  конфиг целиком из env (`S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE`).
  Без этих переменных (`isStorageConfigured() === false`) письма шлются/принимаются нормально, просто
  вложения не сохраняются. Решение закрывает `B10` из ROADMAP.md только для email; вложения в
  карточках сделок/контактов вообще — по-прежнему бэклог.
- Скачивание — только через time-limited signed URL (`getSignedDownloadUrl`), не публичный bucket; доступ
  проверяется по `EmailAccount` письма (`canAccessAccount`) перед выдачей ссылки.

### Frontend — multipart и axios
- И `dealsApi.sendEmail`, и `emailApi.compose` шлют `FormData` — обязательно `headers: {'Content-Type':
  undefined}` в конкретном вызове `apiClient.post`, иначе глобальный дефолт `application/json`
  (`lib/api/client.ts`) не даёт axios/браузеру подставить правильный `multipart/form-data; boundary=...`
  автоматически, и сервер не может распарсить тело через `multer`.

## Раздел «Чаты» — единый инбокс мессенджеров (июль 2026)

Второй единый инбокс после «Почты», но для мессенджеров (WazzUp-каналы + SMS, НЕ email). В отличие
от «Почты» группировка не по `threadKey` (это поле пишется только для `channel: 'email'`), а по
`contactId` — один чат = один контакт, все его каналы переписки в одной ленте.

- **Роуты** `routes/chats.ts`: `GET /api/chats` (список — последнее сообщение на контакт +
  непрочитанные, `distinct(['contactId'])` тем же приёмом, что `email.ts` для `threadKey`),
  `GET /api/chats/:contactId` (полная переписка, помечает входящие прочитанными), `POST
  /api/chats/:contactId/messages` (только ответ в уже существующую переписку — холодной отправки
  из «Чатов» нет, для первого сообщения по-прежнему `NewMessageDialog` в карточке сделки).
- **Непрочитанные — переиспользуют `Message.readAt`**, раньше писавшийся только для email;
  фильтр `channel: {not: 'email'}` в обоих местах исключает пересечение счётчиков «Почты» и «Чатов».
- **Объём данных — сознательно НЕ полный**: сообщения без `contactId` (WazzUp не смог сматчить
  отправителя) в «Чаты» не попадают. `Message.chatId` теперь существует (см. замечание 60), но
  добавлен для другой задачи (подпись канала/клиента над сообщением) и группировкой несматченных
  диалогов сам по себе не занимается — включение этого по-прежнему отдельная задача, доработка
  `handleMessageEntry`/`chats.ts` под группировку по `chatId` при `contactId: null`.
- **Подпись канала/клиента над сообщением** (`Message.channelId`/`Message.chatId`, см. замечание 60):
  над каждым сообщением в ленте — наш конкретный WazzUp-канал (`plainId`, если каналов транспорта
  несколько) и сырой идентификатор клиента, использованный для этого сообщения.
- **Видимость** (`services/chats/access.ts`, `canViewContact`): админ видит всё; менеджер видит
  чат, если он `assigneeId` хотя бы по одной недалённой сделке контакта (объединение по ВСЕМ
  сделкам контакта, не только последней); если у контакта вообще нет сделок — видно всем
  (назначить не на кого).
- **`dealId` у сообщений, отправленных из «Чатов»**: если у контакта ровно одна недалённая сделка —
  сообщение сразу привязывается к ней (видно и в карточке сделки), при 0 или >1 сделках — `dealId:
  null` (сообщение живёт только в «Чатах»).
- **Общий хелпер отправки** `services/messaging/sendToContact.ts` (`resolveRecipient` +
  `sendMessageToContact`) — вынесен из `routes/deals.ts POST /:id/messages`, чтобы не дублировать
  резолв chatId/recipientType (замечание 49) и логику создания `Message`+эмита+`sendViaTransport`
  между картой сделки и «Чатами»; `deals.ts` теперь зовёт его для немедленной отправки, отложенная
  отправка (`scheduleMessage`) осталась отдельной веткой — у неё другая семантика (BullMQ delayed job).
  Заодно `sendViaTransport` (`services/messaging/send.ts`) научился принимать `recipientType`
  (раньше только `wazzupClient.sendMessage` напрямую в `deals.ts` его прокидывал — SMS-отправка через
  общий хелпер этот параметр просто игнорирует, он нужен только `tgapi`/`max`).
- **Сокет-комнаты** (`socket/handlers.ts`): `chats:inbox` (весь список, join на странице `/chats`) +
  `contact:{contactId}` (открытый чат, join при выборе — как `deal:{id}` в `DealModal`). Вебхук
  `handleMessageEntry` в `webhooks/wazzup.ts` теперь эмитит `NEW_MESSAGE` в эти комнаты, когда
  `contactId` резолвился, НЕЗАВИСИМО от `dealId` — раньше единый `if (dealId)` гейтил вообще любой
  эмит, и входящее от контакта без активной сделки тихо сохранялось в БД, никак не всплывая в
  интерфейсе (тот же класс бага, что и в замечании 51, только на уровне «событие не эмитится вообще»,
  а не «эмитится не в ту комнату»).

## Skills для проекта

### Системные skills (использовать при разработке)

| Команда | Когда использовать |
|---------|-------------------|
| `/run` | Запустить dev-окружение и проверить фичу в браузере |
| `/verify` | Проверить что изменение работает правильно в реальном приложении |
| `/code-review` | Ревью перед merge (особенно для автоматизаций и webhook-обработчиков) |
| `/security-review` | Перед деплоем — проверить webhook-подписи, JWT, SQL-инъекции |

### Проектные команды (создать в `.claude/commands/`)

**`.claude/commands/dev.md`** — поднять dev-окружение
```
Запустить: docker-compose -f docker-compose.dev.yml up -d
Затем: cd apps/api && npx prisma migrate dev
Затем: cd apps/web && npm run dev
Убедиться что http://localhost:3000 открывается
```

**`.claude/commands/migrate.md`** — создать и применить миграцию
```
Из директории apps/api:
1. Если есть изменения в schema.prisma — npx prisma migrate dev --name <name>
2. Проверить что в prisma/migrations/ появился новый файл
3. Запустить npx prisma generate
```

**`.claude/commands/seed.md`** — заполнить БД тестовыми данными
```
Из apps/api: npx ts-node prisma/seed.ts
Должны создаться: 1 воронка, 5 этапов, 10 сделок, 5 контактов, 3 пользователя
```

**`.claude/commands/webhook-test.md`** — протестировать webhook WazzUp/UIS локально
```
Использовать ngrok или localtunnel для экспоза localhost:4000
curl -X POST http://localhost:4000/api/webhooks/wazzup -H "Content-Type: application/json" -d @tests/fixtures/wazzup-message.json
Проверить что сообщение сохранилось в messages и появилось в карточке сделки
```

---

## Переменные окружения (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/crm_db

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# WazzUp
WAZZUP_API_KEY=
WAZZUP_CHANNEL_ID=
WAZZUP_WEBHOOK_SECRET=

# UIS (ЮИС)
UIS_API_KEY=
UIS_API_SECRET=
UIS_VIRTUAL_NUMBER=

# App
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
PORT=4000
NODE_ENV=development

# CORS — ОБЯЗАТЕЛЕН в production (fail-fast при старте API), список через запятую
CORS_ORIGIN=http://localhost:3000

# Таймзона школы — рендер {дата}/{время} в напоминаниях о пробных уроках
SCHOOL_TZ=Europe/Moscow

# Демо-данные: seed создаёт пользователей ТОЛЬКО при SEED_DEMO=true + заданном пароле
SEED_DEMO=true
SEED_DEMO_PASSWORD=change-me
```

---

## Статус разработки

Полный чеклист «что реализовано / что осталось» вынесен в **`docs/ROADMAP-full.md`** —
фичи по волнам, безопасность, масштабирование, мульти-ниша и ручные действия на проде.
При завершении фичи или появлении нового пункта бэклога обновлять его, а не этот файл.

---

## Важные замечания для разработки

1. **Кастомные поля напрямую в БД**: при обновлении `custom_fields` JSONB убедись что UI читает данные через TanStack Query (не кэширует на долго). Для массового обновления — SQL:
   ```sql
   UPDATE deals SET custom_fields = custom_fields || '{"field_key": "new_value"}' WHERE pipeline_id = 'xxx';
   ```

2. **WazzUp webhook — токен в URL, НЕ подпись**: WazzUp вообще не подписывает вебхуки — в их API нет ни HMAC, ни «секрета вебхука» (официальная документация: из заголовков только `Content-Type` и опциональный `Authorization: Bearer <crmKey>`). Ранний код ждал вымышленный заголовок `X-Wazzup-Signature` — в production такая проверка не проходила НИКОГДА (ни с секретом, ни без), все входящие вебхуки отклонялись. Текущий механизм (июль 2026): `webhooksUri` регистрируется через `PATCH https://api.wazzup24.com/v3/webhooks` с секретом прямо в URL — `.../api/webhooks/wazzup?token=<WAZZUP_WEBHOOK_SECRET>`; роут сравнивает `?token=` (или `Authorization: Bearer`) с env-переменной через `timingSafeEqual` (сначала длины буферов — иначе throw → 500). В production при незаданном `WAZZUP_WEBHOOK_SECRET` запросы отклоняются (в dev — пропускаются). При смене секрета — перерегистрировать webhooksUri с новым token.

3. **UIS webhook**: проверка `Authorization: Bearer <UIS_API_KEY>` через `timingSafeEqual` (не `===`). Та же семантика: в production без ключа — отказ.

4. **Socket.io rooms**: каждый пользователь входит в комнаты `pipeline:{id}` при открытии канбана. Не рассылать события всем — только в нужную комнату.

5. **JSONB индексы**: после добавления кастомных полей, которые часто фильтруются, добавлять GIN-индекс:
   ```sql
   CREATE INDEX deals_custom_fields_gin ON deals USING gin(custom_fields);
   ```

6. **Роли — RBAC работает**: `requireRole('admin')` из `middleware/auth.ts` стоит на всех мутациях pipelines/stages, fields, automations и `/integrations/wazzup/sync`. Чтение открыто всем залогиненным. При добавлении новых конфигурационных/разрушительных роутов — вешать `adminOnly`. `GET /api/auth/users` отдаёт `email` только админам (для селекторов ответственного хватает `id`+`name`).

7. **BullMQ triggerAutomation — fire-and-forget**: вызывать `triggerAutomation().catch(console.error)`, **не** `await triggerAutomation()`. Если Redis недоступен, `await` подвесит HTTP-запрос навсегда — Express 4 не ловит ошибки в async-роутах без явного try/catch.

8. **Express 4 — глобальный обработчик ошибок**: в `apps/api/src/index.ts` добавлен middleware `(err, req, res, next)` после всех роутов. Все мутирующие async-роуты в `deals.ts` обёрнуты в `try/catch + next(err)`.

9. **Zustand + SSR — hydration guard**: в `layout.tsx` проверять `_hasHydrated` перед редиректом на `/login`, иначе пользователь вылетает из аккаунта при каждом обновлении страницы. Паттерн:
   ```typescript
   // auth.store.ts
   _hasHydrated: false,
   setHasHydrated: (v) => set({ _hasHydrated: v }),
   // persist config:
   onRehydrateStorage: () => (state) => { state?.setHasHydrated(true) }

   // layout.tsx
   if (_hasHydrated && !user) router.push('/login')
   if (!_hasHydrated) return null
   ```

10. **datetime-local → ISO**: input `type="datetime-local"` возвращает `"2024-01-15T10:00"` (без timezone). Zod `z.string().datetime()` требует полный ISO 8601. Конвертировать перед отправкой:
    ```typescript
    dueDate: value ? new Date(value).toISOString() : undefined
    ```

11. **TanStack Query — инвалидация при смене этапа**: настройки воронки должны инвалидировать ОБА ключа — `['pipelines']` и `['kanban']`, иначе канбан-доска не обновится. При обновлении сделки — инвалидировать `['deals']` в дополнение к `['deal', id]`, иначе список сделок показывает устаревший этап.

12. **Socket.io — комнаты сделки**: DealModal должен подключаться к комнате `deal:{id}` через `socket.emit('join:deal', dealId)` при монтировании и покидать её при размонтировании. Без этого события `MESSAGE_STATUS` и `MESSAGE_EDITED` не доходят, если пользователь открыл сделку не с канбана (и не состоит в `pipeline:{id}`).

13. **Отложенные сообщения — BullMQ**: `services/scheduled-messages/worker.ts`. Сообщение сразу создаётся в БД со `status: "scheduled"`, задача добавляется в очередь с `delay = scheduledAt - now()`. Worker обновляет статус через socket при отправке. Импортировать worker в `index.ts` для инициализации очереди.

14. **WazzUp canInitiate — определяется по транспорту + plainId**: поле `canInitiate` не хранится. Логика в функции `channelCanInitiate(transport, plainId)`:
    - **Семантика Telegram-транспортов у WazzUp** (подтверждена реальным ответом `GET /v3/channels`, июль 2026; до этого в коде была инвертирована): `tgapi` = **личный** Telegram-аккаунт (Telegram API по номеру телефона, plainId — номер), `telegram` = Telegram-**бот** (BotFather, plainId — username на `bot`).
    - `whatsapp`, `tgapi`, `max` — личные каналы, поддерживают первый контакт
    - `telegram`, `maxbot` и прочие — только ответы
    - **Защитная ветка**: канал `telegram` с `plainId`, НЕ оканчивающимся на `bot` (легаси-личный аккаунт, если WazzUp такое вернёт), считается личным и может писать первым — у настоящих ботов username обязан оканчиваться на `bot` (правило самого Telegram).
    - Соответственно в словарях: `TRANSPORT_LABELS.tgapi = 'Telegram'` ✈️, `TRANSPORT_LABELS.telegram = 'Telegram Bot'` 🤖. Спец-кейс «получатель по @username + телефонам» в `NewMessageDialog.tsx` и `DealModal.tsx` (resolveChatId) распространяется на ОБА транспорта `tgapi`/`telegram`.

15. **Смена этапа — мульти-воронки**: `PATCH /api/deals/:id/stage` теперь обновляет не только `stageId`, но и `pipelineId` (смотрит к какой воронке принадлежит новый этап). Socket-событие `DEAL_MOVED` рассылается в обе комнаты — `pipeline:{prevPipelineId}` и `pipeline:{newPipelineId}` — если воронки разные. В DealModal дропдаун этапов загружает ВСЕ воронки через `pipelinesApi.list()` и группирует этапы по воронке через `<optgroup>`.

16. **Навигация настроек**: отдельного пункта «Интеграции» в сайдбаре нет — всё в разделе «Настройки». Общий суб-нав реализован через `settings/layout.tsx` с двумя группами: CRM (Воронка / Поля / Автоматизации) и Интеграции (WazzUp). URL интеграций: `/settings/wazzup`. Старый `/settings/integrations` делает server-side redirect на `/settings/wazzup`.

17. **requiredAtStageIds — Prisma array filter**: для проверки обязательных полей при переходе в этап использовать `prisma.fieldDefinition.findMany({ where: { requiredAtStageIds: { has: stageId } } })`. Возвращает 422 с `{ error: 'required_fields', fields: [{id, key, label}] }`.

18. **Socket.io — обязательный JWT**: `io.use()` в `socket/handlers.ts` проверяет `socket.handshake.auth.token` через `verifyAccessToken` (общий хелпер из `middleware/auth.ts`). Клиент передаёт токен в `lib/socket.ts` через `auth: () => ({ token: localStorage.getItem('access_token') })` — функция, а не объект, чтобы при reconnect брался свежий токен. Анонимные подключения отклоняются.

19. **Rate limit на /login и /refresh** (10 запросов/мин на IP, `express-rate-limit`). ЛОВУШКА при отладке: форма логина показывает «Неверный email или пароль» при ЛЮБОЙ ошибке (catch без разбора статуса в `login/page.tsx`) — включая 429 и сетевые сбои. Если «пароль не подходит» — сначала проверить реальный ответ API через curl.

20. **CORS_ORIGIN обязателен в production**: API падает при старте (`throw`) если `NODE_ENV=production` и переменная пуста — это сделано намеренно, чтобы не уехать в прод с `origin: '*'` + `credentials: true`. Поддерживается список через запятую.

21. **Глобальный error handler не отдаёт `err.message` в production** — только generic `Internal server error`. Детали — в логах API (`docker compose logs api` на сервере). В dev `message` присутствует в ответе.

22. **Seed — только по явному флагу**: `prisma/seed.ts` выходит сразу, если `SEED_DEMO !== 'true'`; пароль демо-юзеров — из `SEED_DEMO_PASSWORD` (захардкоженного test123 больше нет). В Docker-деплое seed вообще не вызывается автоматически — запускать вручную (`docker compose exec api npx tsx prisma/seed.ts`) только при явной необходимости, на проде не запускать.

23. **Зачистка/смена пароля на проде**: `apps/api/scripts/remove-demo-users.ts` — переназначает сделки и задачи демо-менеджеров на админа (у `Task.assigneeId` связь обязательная — без переназначения удаление юзера упадёт по FK), удаляет manager1/manager2, ставит админу пароль из `ADMIN_NEW_PASSWORD`. Запуск локально против прод-БД: `DATABASE_URL='<external-url>' ADMIN_NEW_PASSWORD='<пароль>' npx tsx scripts/remove-demo-users.ts`. Env-значения со спецсимволами (`$`, `!`) — ТОЛЬКО в одинарных кавычках, иначе шелл их исказит. Выполнено 2026-07-03: менеджеры удалены, пароль admin сменён.

24. **Смена пароля в БД не требует рестарта** — API читает hash при каждом логине. Рестарт нужен только при смене env-переменных. Смена `JWT_SECRET`/`JWT_REFRESH_SECRET` в `.env` на сервере + `docker compose up -d --force-recreate api` мгновенно инвалидирует ВСЕ выданные токены (все перелогиниваются) — это и есть аварийный «разлогин всех», пока нет отзыва refresh-токенов.

25. **Лимиты тела запроса**: `express.json({ limit: '1mb' })`, для webhooks — `express.raw({ limit: '1mb' })`, nginx `client_max_body_size 2M`. При добавлении загрузки файлов — поднимать согласованно в обоих местах.

26. **nginx TLS**: 443 + редирект с 80, HSTS, security-заголовки. Сертификаты — `nginx/certs/fullchain.pem` + `privkey.pem` (certbot, маунт прописан в `docker-compose.yml`, папка в `.gitignore`). Без сертификатов контейнер nginx не стартует.

27. **Seed НЕ обновляет пароли существующих юзеров**: `prisma/seed.ts` использует `upsert`, у которого `update` не трогает `passwordHash`. Если локальная БД старая и пароль демо-админа неизвестен — сбросить напрямую:
    ```bash
    cd apps/api && npx tsx -e "
    import bcrypt from 'bcryptjs'; import { PrismaClient } from '@prisma/client'
    new PrismaClient().user.update({ where: { email: 'admin@crm.local' },
      data: { passwordHash: bcrypt.hashSync('НОВЫЙ', 10) } }).then(() => process.exit(0))"
    ```

28. **Проверка успешного деплоя** — `docker compose logs api` должен показать `No pending migrations
    to apply` и `API running on http://localhost:4000`; если билд с новым кодом падает, `prisma
    migrate deploy` не выполнится и старый контейнер продолжит работать (либо просто упадёт) — по
    логам сразу видно, какой из двух случаев. Дополнительный маркер нового кода: `POST /api/leads`
    отвечает 404 на старом коде, 503 «Форма захвата лидов не настроена» — на новом (если форма не
    настроена).

29. **Redis — свой, в контейнере рядом с API** (`docker-compose.yml`, с паролем; в dev — `docker-compose.dev.yml`). Лимитов на число команд нет, поэтому три BullMQ-очереди (`automations`, `scheduled-messages`, `trial-reminders`) + sweep каждые 15 мин ничего не упирают. Тюнинг воркеров под холостой поллинг всё равно применён — см. `workerTuning` в `lib/redis.ts` и замечание 87.

30. **Как тестировать напоминания локально**: в `/settings/trials` временно поставить офсет «за 2 минуты», записать пробный через 3 минуты. Без кредов TargetSMS/WazzUp отправка упадёт — это нормально для проверки механики: в ленте сделки появится error-Message (3 штуки — по числу ретраев BullMQ), а клейм офсета откатится. Шаблон и таймзону видно прямо в тексте error-сообщения. Кириллица в query-параметрах curl — только через `--data-urlencode`, иначе API вернёт не-JSON.

31. **jobId в BullMQ — без двоеточий**: `:` — разделитель ключей BullMQ, кастомный jobId с ним работает некорректно. Принятый формат: `trial_{id}_{offset}_{ts}`, `timer_{autoId}_{dealId}_{ts}`. Детерминированный jobId = отмена через `queue.remove(jobId)` за O(1) (не копировать O(n)-скан `getDelayed()` из `cancelScheduledMessage`).

32. **`SCHOOL_TZ`** задаётся в `.env` на сервере; смена требует `docker compose up -d --force-recreate
    api`. В коде дефолт тот же `Europe/Moscow` (`trial-reminders/worker.ts`), так что отсутствие
    переменной не ломает напоминания, просто использует московское время.

33. **Очереди BullMQ в HTTP-роутах — ВСЕГДА после записи в БД и fire-and-forget** (обобщение замечания 7 на `queue.add`/`queue.remove`). Причина найденного бага «кнопки пробного урока не работают»: роуты trials делали `await scheduleTrialReminders()` после создания и `await cancelTrialReminders()` ДО обновления БД. При недоступном Redis ioredis (maxRetriesPerRequest: null у BullMQ) держит команды в offline-очереди вечно → HTTP-запрос зависает: создание попадало в БД, но ответ не приходил (UI не обновлялся), а PATCH не доходил до БД вовсе. Правильный порядок: запись в Postgres → ответ клиенту → очереди через `.then().catch(console.error)`. Это безопасно: guard-ы воркера (status/scheduledAt-снапшот) обезвреживают неотменённые джобы, sweep догоняет незапланированные. Проверка фикса: поднять API с `REDIS_URL=redis://localhost:6390` (мёртвый порт) — POST/PATCH trials должны отвечать мгновенно. ⚠️ Тот же анти-паттерн ещё остался в `POST /deals/:id/messages` (`await scheduleMessage` для отложенных) — там нет sweep-подстраховки, чинить аккуратнее.

34. **Кэш TanStack Query — не полагаться только на сокет-события для инициатора действия**: после мутации, меняющей сделку (drag в канбане → `moveStage`), инициатор должен САМ инвалидировать `['deal', id]` и `['deals']` — сокет-событие `DEAL_MOVED` может потеряться (reconnect, гонка), и тогда при `staleTime: 30s` открытие карточки показывает старый этап. Дополнительно у запроса сделки в DealModal стоит `refetchOnMount: 'always'` — каждое открытие карточки фоново подтягивает свежие данные (кэш рендерится сразу, без мигания). Сокет-инвалидация остаётся для ДРУГИХ пользователей. Симптом бага: «этап не обновился, помогает подождать/перезагрузить».

35. **Платёжные вебхуки — form-urlencoded**: CloudPayments и Робокасса шлют уведомления как `application/x-www-form-urlencoded`, поэтому raw-парсер `/api/webhooks` в `index.ts` принимает ОБА типа (`['application/json', 'application/x-www-form-urlencoded']`). JSON.parse в общем middleware обёрнут в try/catch — для urlencoded `req.body` станет `{}`, это нормально: платёжный роутер работает только с `req.rawBody` (провайдер сам парсит тело по content-type). Подпись CP — HMAC-SHA256 от сырых байт base64 (`Content-HMAC`), Робокассы — `MD5(OutSum:InvId:Password2)` регистронезависимо.

36. **Robokassa InvId строго числовой** → у Payment есть `invoiceId Int @unique @default(autoincrement())` (общий для обоих провайдеров, ищется вебхуком). Подпись ссылки считать от ТОЙ ЖЕ строки `OutSum`, что ушла в URL — формат `Number(x).toFixed(2)` («7500.00»), иначе подпись не сойдётся.

37. **Идемпотентность платёжного вебхука — два уровня**: переход статуса через `updateMany({where: {id, status: 'pending'}})` (0 строк = повтор или отменённый счёт → ack без побочных эффектов) + `@unique Subscription.paymentId` (дубль подписки невозможен даже при гонке). Незнакомый invoiceId → **ack, не 404** — иначе провайдер вечно ретраит чужое/тестовое уведомление. Оплата по отменённому счёту логируется для ручного разбора. Побочные эффекты (подписка/Activity/автоперенос) — каждый в своём try/catch ПОСЛЕ перехода статуса: сбой эффекта не должен оставить провайдера без ack.

38. **Новый триггер автоматизаций — ТРИ места синхронно**: union в `engine.ts` (AutomationEvent.type), enum в `routes/automations.ts` (triggerSchema), `TriggerType` в `packages/shared/src/types/automation.ts` (+ `triggerLabels` в `settings/automations/page.tsx`). Особенность `subscription_low_balance`: матчинг по точному равенству `event.remaining === threshold` — идемпотентность без хранения флагов; НЕ менять на `<=`, иначе автоматизация будет стрелять на каждом списании ниже порога.

39. **`prisma migrate dev` не работает без TTY** (harness/CI): «environment is non-interactive». Обход: `printf 'y\n' | script -q /dev/null npx prisma migrate dev --name <name>` (псевдо-TTY + автоподтверждение) или полностью неинтерактивно — `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<name>/migration.sql` затем `npx prisma migrate deploy && npx prisma generate`. После — проверить, что папка миграции реально создалась (`ls prisma/migrations`).

40. **Вложенные диалоги внутри DealModal — обязателен `stopPropagation` в ОБЕИХ ветках рендера**: DealModal закрывается кликом по своему оверлею, а диалоги (`NewMessageDialog`, `LostReasonDialog`) рендерятся внутри него как React-дети — клик из диалога всплывает по React-дереву до оверлея карточки и закрывает её целиком. Нужны два обработчика: на оверлее диалога `onClick={e => { e.stopPropagation(); onClose() }}` и на внутренней панели `onClick={e => e.stopPropagation()}`. Ловушка: у компонента с ранним `return` для особого состояния (напр. «нет каналов» в NewMessageDialog) эту пару легко забыть именно в альтернативной ветке — баг «кнопка Закрыть выбрасывает из сделки». Диалоги, отрисованные внутри панели DealModal (InvoiceDialog в SubscriptionCard), не текут — всплытие гасится stopPropagation самой панели.

41. **Мягкое удаление — КАЖДЫЙ новый запрос к Deal/Contact/Company обязан фильтровать `deletedAt: null`**: физического удаления больше нет, «удалённые» записи лежат в тех же таблицах до 30 дней. Забытый фильтр = записи из корзины всплывают в выборке (список, аналитика, матчинг вебхука, автоматизация). Где фильтр уже стоит: списки deals/contacts/companies, канбан, вложенные include (сделки контакта/компании, контакты компании), вся аналитика (включая raw-SQL помесячной динамики и `_count`), матчинг контакта/сделки в вебхуках WazzUp/UIS и `POST /api/leads`. `GET /:id` намеренно отдаёт и удалённые (нужно корзине и открытым карточкам). Обратная ловушка — роуты `routes/trash.ts`: там наоборот guard `deletedAt: { not: null }` через updateMany/deleteMany (0 строк → 404), чтобы «удалить навсегда» нельзя было применить к активной записи. Восстановление сделки эмитит `DEAL_CREATED`, мягкое удаление — `DEAL_DELETED`; KanbanBoard слушает оба.

42. **Привязка контакта к сделке без него — обычный `PATCH /api/deals/:id`, не отдельный роут**: `contactId` в теле уже принимался этим эндпоинтом (см. `UpdateDealDto`), просто в UI не было формы для случая «контакта нет». `AttachContactCard` (в `DealModal.tsx`) — это не мутация основной формы сделки (`updateMutation`/`isDirty`/saveBar), а отдельная самостоятельная мутация, которая сразу шлёт `contactId` и инвалидирует `['deal', id]`+`['deals']`+`['kanban']` без участия кнопки «Сохранить». При копировании этого паттерна для других полей — не путать с полями основной формы, которые копятся в стейте до явного сохранения.

43. **WazzUp `chatType` ≠ наш внутренний транспорт**: в `services/wazzup/client.ts` `sendMessage` раньше слал в `POST /v3/message` `chatType: channel`, где `channel` — наше внутреннее имя транспорта (`tgapi`/`telegram`/`maxbot`, см. замечание 14). Для WazzUp же различие «личный Telegram-аккаунт vs бот» кодируется через `channelId`, а не `chatType` — валидных значений `chatType` для Telegram в API всего одно, `"telegram"`. Отправка `chatType: "tgapi"` возвращала `INVALID_MESSAGE_DATA` **независимо от содержимого chatId** (баг был незаметен для WhatsApp, т.к. там внутренний транспорт `whatsapp` случайно совпадает с реальным `chatType`). Фикс — маппинг `CHAT_TYPE_MAP` (`tgapi→telegram`, `maxbot→max`) перед отправкой; `channelId` по-прежнему резолвится по внутреннему транспорту через `resolveChannelId`, это не трогали.

44. **Ошибки доставки WazzUp (`messageStatus`) теперь долетают до карточки сделки**: `routes/webhooks/wazzup.ts` раньше разбирал статус-уведомления только в плоском виде (`{event:'messageStatus', messageId, status}`), а задокументированный формат WazzUp — обёртка `{statuses: [{messageId, timestamp, status}]}`; при реальном формате условие `event === 'messageStatus'` никогда не совпадало, и статус недоставки (например, «пользователь сменил ник/удалил Telegram-аккаунт») никогда не долетал до `Message.errorMsg` — карточка сделки продолжала показывать «отправлено» (✓), хотя в самом WazzUp сообщение зависало с ошибкой. Теперь `handleStatusEntry()` понимает ОБА формата, статусы `failed/error/undelivered/notdelivered/rejected` нормализуются в `error`, эмит идёт в обе комнаты (`pipeline:{id}` и `deal:{id}`) с `errorMsg` — фронт (`DealModal.tsx`) уже умел рендерить `errorMsg` для исходящих сообщений, просто раньше его никогда не получал. **Открытый вопрос**: WazzUp нигде не документирует точное имя поля с текстом причины отказа — код пробует `description/errorMessage/error/reason/data.description` по очереди и логирует сырой payload в консоль при `status=error`, чтобы уточнить реальное имя поля по первому же боевому failure. Также стоит проверить в личном кабинете WazzUp, что вебхук на статусы сообщений включён (не только на новые сообщения) — иначе `/api/webhooks/wazzup` эти уведомления вообще не получит.

45. **FormData-запросы к API — обязателен `headers: {'Content-Type': undefined}` в конкретном вызове**: `apiClient` (`lib/api/client.ts`) ставит дефолт `'Content-Type': 'application/json'` при создании инстанса axios — этот дефолт мержится в КАЖДЫЙ запрос и глушит автоматическое определение `multipart/form-data; boundary=...`, которое axios/браузер иначе поставили бы сами при теле-`FormData`. Без явного оверрайда сервер получает `Content-Type: application/json` с multipart-телом внутри и `multer` не может его распарсить (`req.body`/`req.files` пустые, без явной ошибки — тихий баг). Используется в `dealsApi.sendEmail()` и `emailApi.compose()` (вложения писем) — при добавлении новых multipart-эндпоинтов не забывать этот оверрайд.

46. **Исходящий SMTP требует открытых портов 25/465/587 у хостера — это первое, что проверять.**
    Многие облачные провайдеры режут исходящий трафик на эти порты по умолчанию: `nodemailer`
    тогда зависает в таймауте при отправке (`services/email/client.ts`), а IMAP (993) при этом
    работает нормально — приём писем идёт, ломается только отправка, что сбивает с толку.
    Характерный симптом в `POST /email-accounts/:id/test`: `SMTP: connect ENETUNREACH <IPv6>` при
    успешной IMAP-части. IPv6-адрес в сообщении — не суть проблемы, а последний из перебора адресов
    (`dns.setDefaultResultOrder('ipv4first')` в `index.ts` пробует IPv4 первым, но если он закрыт по
    порту, Node доходит до IPv6 и ловит `ENETUNREACH`); этот форс IPv4 всё равно нужен — отдельная
    проблема маршрутизации, не связанная с портами. На VPS порты открыты; если отправка перестанет
    работать — проверять `ufw`/`docker network` на самом сервере и правила провайдера.

47. **Settings-страницы (`/settings/*`) без loading/error UI для вложенных fetch'ей выглядят как «кнопка не работает»**: в `settings/email/page.tsx` клик по «редактировать» (`Pencil`) ставит `editingId` и запускает отдельный `useQuery` за полной записью аккаунта (пароли не приходят в списочном `PUBLIC_SELECT`) — до фикса не было ни спиннера, ни сообщения об ошибке на время этого запроса, поэтому медленный или упавший (403 для не-admin, сетевая ошибка) запрос выглядел как полностью нерабочая кнопка: строка молча оставалась в обычном (не-edit) виде. Паттерн фикса — показывать `isLoading`/`isError` состояние ИМЕННО у строки, которая ждёт свои данные, а не полагаться на то, что переход в форму произойдёт сам собой. При добавлении новых inline-edit паттернов с отдельным fetch по клику — закладывать это сразу.

48. **Ключ кастомного поля (`FieldDefinition.key`) генерируется автоматически из label, а не вводится пользователем** (июль 2026): `POST /api/fields` больше не принимает `key` в теле — форма `settings/fields/page.tsx` (`AddFieldModal`) не показывает это поле вовсе. Бэкенд (`routes/fields.ts`) транслитерирует кириллицу простой посимвольной картой (а→a, ж→zh, щ→sch...) и слагифицирует label в ключ («Уровень ученика» → `uroven_uchenika`) — это сделано специально, чтобы не потерять читаемость ключа для прямых SQL-правок `custom_fields` (архитектурный принцип №1 выше), при этом не заставляя менеджера придумывать латинский идентификатор руками. При коллизии сгенерированного ключа с уже существующим полем (в рамках `entityType`+`pipelineId`) добавляется суффикс `_1`, `_2`... и в ответе создания уходит `duplicate: true` — фронт показывает `alert` с итоговым именем, чтобы админ понимал, что создан дубль, а не оригинал. Не путать с отдельной функцией `slugify()` в том же файле (только латиница, без транслитерации) — она генерирует `value` для options select/multiselect, другая задача и другая функция.

49. **WazzUp `chatId` для Telegram Personal/MAX (`tgapi`/`max`) при холодной отправке — фикция, WazzUp принимает её молча, но чат не создаёт** (июль 2026): для транспортов `tgapi`/`max` (личные аккаунты, не боты) `POST /v3/message` резолвит получателя ПО-РАЗНОМУ в зависимости от того, в каком поле JSON передан идентификатор — `chatId` (значение, ранее пришедшее в вебхуке входящего сообщения) запускает отправку в уже существующий чат; `phone`/`username` — отдельные поля, только они запускают у WazzUp реальный поиск/инициацию Telegram-чата по номеру/юзернейму (см. https://wazzup24.ru/help/api-ru/otpravka-soobshhenij/). До фикса код всегда клал угаданное значение (голые цифры телефона или `@username`, для новых контактов без истории переписки) в поле `chatId` — WazzUp отвечал 200/201 с валидным `messageId`, `Message.status` в БД становился `sent` без единой ошибки, но сообщение НЕ появлялось даже в собственном интерфейсе WazzUp (не говоря о доставке в Telegram) — false positive на всех уровнях нашего мониторинга. Диагностировано только сравнением с реальным ответом поддержки WazzUp по конкретному запросу/ответу (пришлось включить временный `console.log` сырого запроса в `wazzupClient.sendMessage`, см. замечание про диагностику ниже). Фикс — `wazzupClient.sendMessage()` принимает `recipientType: 'chatId'|'phone'|'username'` (дефолт `'chatId'`, обратная совместимость) и кладёт значение в соответствующее поле payload вместо всегда-`chatId`; `routes/deals.ts` (`POST /:id/messages`) резолвит `recipientType` = `'chatId'`, если есть установленная переписка (`ContactChannel`/`wazzupChatId`), иначе `'phone'` для `tgapi`/`max` при отправке по телефону (или `'username'`, если фронт явно попросил) — прокидывается через `scheduleMessage()`/BullMQ job data и до `MessagesTab`/`NewMessageDialog.tsx` на фронте (там же теги `kind` у вариантов получателя). Для `whatsapp`/`sms`/ботовых транспортов (`telegram`, `maxbot`) ничего не изменилось — `phone`/`username` там не поддерживаются самим WazzUp, чат всегда идентифицируется через `chatId`=телефон. **Ловушка на будущее**: 200/201 с валидным `messageId` от WazzUp — НЕ доказательство реальной доставки для `tgapi`/`max`, если чат не был установлен ранее; при новых баг-репортах «сообщение не доходит» первым делом проверять, каким полем ушёл идентификатор получателя, а не только статус ответа.

50. **Входящие сообщения WazzUp не обрабатывались вообще — обработчик вебхука ждал несуществующий плоский формат** (июль 2026, найдено сразу после замечания 49): `routes/webhooks/wazzup.ts` разбирал тело как `{event, chatId, channel, direction, text, messageId}` — такого формата у WazzUp нет и не было; реальный документированный формат — `{"messages": [{messageId, chatId, chatType, channelId, text, isEcho, ...}]}` (массив), см. https://wazzup24.ru/help/api-ru/webhooks-2/. Поле `event` в реальных вебхуках отсутствует → `event !== 'message'` было истинным всегда → любое входящее сообщение молча проглатывалось (200 `{"ok":true}`), **ни разу не попадая в `Message`** — статус-вебхуки (`{statuses: [...]}`, замечание 44) обрабатывались нормально, это отдельная, независимо проверенная ветка. Баг всплыл только потому, что для замечания 49 пришлось логировать сырые запросы и заодно проверять входящую сторону — до этого «работает» держалось на вере в код, который никогда не гонялся против реального продакшен-трафика WazzUp. Фикс — `handleMessageEntry()` разбирает каждый элемент `messages[]`, пропускает `isEcho: true` (наши же исходящие, статус которых и так приходит через `statuses`), резолвит внутренний transport через `channelId` → `wazzup_channels` (надёжнее, чем `chatType`, который не различает бота и личный аккаунт — замечание 14), матчит контакт по `ContactChannel` (per-transport chatId, раньше вообще не читался при матчинге, только писался) → затем `wazzupChatId` (legacy) → затем телефону. **Уточнение того же дня**: телефон для матчинга берётся из вложенного `entry.contact.phone`, а НЕ из `chatId` — для `whatsapp` `chatId` действительно совпадает с телефоном, но для `tgapi`/`max` (личные Telegram/MAX) `chatId` — непрозрачный внутренний числовой ID чата (подтверждено реальным трафиком: `chatId: "123456789"` при реальном `contact.phone: "79001234567"` того же человека) — первая версия фикса ошибочно считала `chatId` телефоном и для этих каналов тоже (по аналогии с замечанием 49, где WazzUp при СТАРОМ баге просто эхом возвращал присланный номер как `chatId`, что и создало ложное впечатление их эквивалентности). Лог сырого тела `[wazzup] webhook received` в начале роута теперь пишется только при `LOG_WAZZUP_BODY=true` (замечание 88) — включать для сверки формата с тем, что шлёт реальный WazzUp-аккаунт (в этом проекте уже дважды была ситуация «в доке/коде одно, в проде другое» — сначала с подписью вебхука, замечание 2, потом с полем отправки). **Ловушка на будущее**: не доверять существующему обработчику вебхука только потому что код выглядит рабочим и задеплоен давно — до первого реального вебхука с реальным аккаунтом это никем не подтверждено; при следующих «X не работает» с любым внешним вебхуком (UIS, платежи) в первую очередь сверять реальное тело запроса (`console.log` сырого `req.body`) с тем форматом, что ожидает код, а не только читать код и доверять комментариям.

51. **Новый `handleMessageEntry()` (замечание 50) при первом деплое эмитил `NEW_MESSAGE` только в `pipeline:{id}`, забыв `deal:{id}`** — тот же класс бага, что уже описан в замечании 12 для `MESSAGE_STATUS`/`MESSAGE_EDITED`, просто наступили на те же грабли в новом коде. Симптом: входящие сообщения корректно доходят и матчатся (замечание 50 работает), но не появляются в открытой карточке сделки без выхода/перезахода — потому что открытая не с канбана `DealModal` состоит в комнате `deal:{id}`, а не `pipeline:{id}`. Фикс — emit в обе комнаты, как и в `POST /deals/:id/messages`. **Ловушка на будущее**: при добавлении любого нового `emitToRoom(... 'NEW_MESSAGE'/'MESSAGE_STATUS'/'MESSAGE_EDITED' ...)` — всегда обе комнаты, `pipeline:{pipelineId}` И `deal:{dealId}`, по умолчанию, а не по одной с расчётом добавить вторую при жалобе.

52. **`socket.connect()` вызывался только внутри `KanbanBoard.tsx` — нигде больше в приложении** (июль 2026, найдено после замечания 51 не помогло целиком): `lib/socket.ts` создаёт синглтон с `autoConnect: false`, поэтому кто-то обязан явно вызвать `.connect()`. Единственным таким местом был `KanbanBoard`. Карточка сделки, открытая НЕ с канбана (список `/deals`, `/contacts/[id]` и т.д. — см. структуру проекта, `DealModal` открывается напрямую без канбана на странице), в рамках сессии, где пользователь ни разу не заходил на `/pipeline/[id]`, работала с полностью неподключённым сокетом: `socket.emit('join:deal', dealId)` уходил в пустоту, и НИ ОДНО реалтайм-событие (`NEW_MESSAGE`, `MESSAGE_STATUS`, `MESSAGE_EDITED`, `TRIAL_UPDATED`, `SUBSCRIPTION_UPDATED`, `PAYMENT_RECEIVED`) не доходило — помогало только закрыть/переоткрыть карточку (обычный REST-рефетч) или зайти на канбан. Из-за этого фикс замечания 51 (обе комнаты) сам по себе не помог — комнату некому было слушать. Фикс — `connectSocket()`/`disconnectSocket()` перенесены в `(dashboard)/layout.tsx`, вызываются один раз на весь авторизованный сеанс (после `_hasHydrated && user`), а не привязаны к жизненному циклу конкретной страницы. `KanbanBoard` по-прежнему тоже вызывает `socket.connect()` — вызов идемпотентен (no-op на уже подключённом сокете), убирать не стал. **Ловушка на будущее**: если какая-то реалтайм-фича «работает через раз» или «работает только если раньше открывал канбан» — первым делом проверять не комнаты/события, а сам факт подключения сокета (`socket.connected` в devtools/консоли), а не сразу чинить обработчики событий, как это произошло в замечании 51.

53. **Карточка сделки переехала из drawer-модалки в полноэкранную страницу `/deals/[id]`, открываемую в новой вкладке** (июль 2026): `DealModal.tsx` переименован в `components/deal/DealDetail.tsx` — вся внутренняя логика (стейт, мутации, сокет `join:deal`/`leave:deal`, вкладки) не менялась, поменялась только внешняя обёртка (был `fixed inset-0` бэкдроп + `max-w-2xl` панель справа, стало `flex flex-col h-full` на всю страницу) и кнопка закрытия (`X` → стрелка «Назад», как в `contacts/[id]/page.tsx`). Клик по сделке ВЕЗДЕ (канбан, `/deals`, карточка контакта) теперь делает `window.open('/deals/{id}', '_blank', 'noopener,noreferrer')` вместо локального React-стейта — страница `deals/[id]/page.tsx` рендерится внутри `(dashboard)/layout.tsx`, т.е. с сайдбаром и с уже работающим `connectSocket()` из замечания 52. **Кросс-вкладочная синхронизация теперь НЕ через проп `onUpdated`** (он остался в сигнатуре для совместимости, но вызывающие страницы передают в него no-op) — канбан по-прежнему сам ловит `DEAL_MOVED`/`DEAL_UPDATED` через сокет независимо от того, в какой вкладке произошло изменение; страницы без сокет-подписки (`/deals`, `/contacts/[id]`) полагаются на дефолтный `refetchOnWindowFocus: true` в `providers.tsx` (там переопределён только `staleTime: 30s`) — при возврате на вкладку список/карточка сами перезапросят данные. **Ловушка на будущее**: если добавляется новая страница со списком сделок без собственного сокет-слушателя, не пытаться прокидывать `onUpdated` через `window.open` (это разные вкладки, разные React-деревья и разные экземпляры `QueryClient`) — рассчитывать на `refetchOnWindowFocus` или явно подписываться на сокет-события, как это уже сделано в `KanbanBoard`.

54. **502 Bad Gateway после обычного деплоя — nginx кэширует IP `api`/`web` из докер-сети** (июль 2026): `docker compose up -d` пересоздаёт изменившиеся сервисы (`api`, `web`) с новым контейнером → новый внутренний IP в докер-сети (`172.18.x.x`), но `nginx` резолвит хостнеймы апстримов (`server web:3000`/`server api:4000`) один раз при старте master-процесса и не переоткрывает DNS сам, если сам контейнер `nginx` не перезапускался. Итог — `nginx` продолжает стучаться по старому, уже не существующему IP → `connect() failed (111: Connection refused)` в логах и 502 у всех запросов, при этом `docker compose ps` показывает все контейнеры `Up`/`healthy` (включая свежепересозданные `api`/`web` с «API running...»/«Ready in...» в логах) — выглядит так, будто всё живо, но чинит только `docker compose restart nginx`. Фикс — в `.github/workflows/deploy.yml` после `docker compose up -d` добавлен `docker compose restart nginx`, чтобы это не повторялось на каждом автодеплое. **Ловушка на будущее**: если после пуша в `main` сайт отдаёт 502, а `docker compose ps`/`logs api`/`logs web` выглядят нормально — сразу `docker compose restart nginx`, не тратить время на поиск причины в самих `api`/`web`.

---

55. **Allowlist-схемы на PATCH — обязательный паттерн для новых мутирующих роутов** (июль 2026,
    `docs/security-audit.md` Волна 0): до этой правки `PATCH /:id` на `deals`/`contacts`/`companies`/
    `tasks` писали `data: req.body` напрямую в Prisma — любой аутентифицированный клиент мог
    смузлить `deletedAt` (обход admin-only soft-delete), `stageId`/`closedAt`/`lostReasonId` (обход
    бизнес-логики `PATCH /:id/stage`) или вложенные relation-writes типа `{"activities":
    {"deleteMany":{}}}`, которые Prisma принимает молча. Фикс — на каждом PATCH своя `z.object({...
    }).strict()` с allowlist только скалярных полей модели (сверять с `schema.prisma`, не с тем,
    что «кажется» полем); `.strict()` — не просто `.partial()` — отклоняет ЛЮБОЙ незнакомый ключ
    целиком, это и есть защита от relation-writes, а не только от конкретных полей. `automations.ts`/
    `fields.ts` уже были под `requireRole('admin')`, но это не заменяет схему: админ (или CSRF/баг
    из админской сессии) всё ещё мог протащить лишнее поле в теле. **Ловушка при добавлении новой
    сущности с PATCH**: копировать `data: req.body` по аналогии с соседним роутом — так и разошёлся
    этот баг на 4+ файла один раз. Новый PATCH — сразу с allowlist-схемой, по образцу `packages.ts`/
    `pipelines.ts` (`validate(schema.partial().strict())`) или `deals.ts`/`contacts.ts` (ручной
    allowlist, когда часть полей роута — id-связи, управляемые отдельными под-роутами).
    Attach/detach-паттерн (`contactId` в `PATCH /deals/:id`, замечание 42) остаётся в allowlist —
    просто как обычное разрешённое поле, не отдельный путь мимо схемы.
56. **Финансовые мутации (`subscriptions`/`payments`) — `admin`+`manager`, НЕ `teacher`** (июль
    2026, Волна 0): роль `teacher` создана только для селекта преподавателя в `Lesson.teacherId`
    (замечание про роль в разделе A1 волны 1) — до фикса `teacher`-токен мог создавать/отменять
    абонементы, вручную двигать `lessonsTotal`, выставлять/отменять счета через `POST /api/payments`.
    `requireRole('admin', 'manager')` теперь стоит на всех мутирующих роутах `subscriptions.ts` и
    `payments.ts` (`GET` остались открытыми всем — нужны для отображения баланса в карточке).
    **Осознанный побочный эффект**: это же закрыло и `PATCH /:id/lessons/:lessonId` — если в
    реальном UI преподаватели сами отмечают `completed`/`no_show` за проведённый урок, это действие
    для роли `teacher` тоже стало 403. На момент фикса такого сценария в UI не было (карточка
    абонемента — `SubscriptionCard` — открывается менеджеру/админу в DealModal), но если появится
    self-service для преподавателей — понадобится более гранулярное разрешение именно на смену
    статуса урока, а не общий `financeRole`.
57. **Вебхуки — fail-closed по умолчанию через `ALLOW_UNVERIFIED_WEBHOOKS`, не через `NODE_ENV`**
    (июль 2026, Волна 0, закрывает A6): `webhooks/wazzup.ts`/`webhooks/uis.ts` при отсутствующем
    `WAZZUP_WEBHOOK_SECRET`/`UIS_API_KEY` раньше пропускали любой запрос без проверки, если
    `NODE_ENV` не был буквально строкой `'production'` — пустой `NODE_ENV`/любой другой (`staging`,
    опечатка) тоже открывали приём неаутентифицированных вебхуков. Теперь обе проверки читают новый
    флаг `ALLOW_UNVERIFIED_WEBHOOKS=true` (см. `.env.example`) — переменная должна быть выставлена
    ЯВНО и только для локальной разработки без настроенных секретов; по умолчанию (переменная не
    задана) — fail-closed везде, включая dev. Секреты заданы — поведение проверки не изменилось
    (тот же `timingSafeEqual`).
58. **SMS в карточке сделки отсутствовал не по архитектурной причине, а потому что `sendableChannels`
    в `MessagesTab` (`DealDetail.tsx`) строился только из установленных WazzUp-каналов контакта
    (`ContactChannel`) + email** (июль 2026): в отличие от `lib/channelOptions.ts` (использует его
    «Чаты», `TrialLessonCard`, `InvoiceDialog`, `NewMessageDialog`) SMS туда никогда не добавлялся —
    у SMS нет «установленного канала», он всегда резолвится по телефону контакта, а вкладка
    «Сообщения» была написана до того, как этот приём стал общим паттерном. Фикс — `sendableChannels`
    дополняется SMS-опциями через `channelOptions(contact).filter(transport === 'sms')`, по одной на
    каждый телефон контакта. Побочный эффект: раньше канал в этой вкладке был уникален по `transport`
    (кнопка/стейт держали просто имя транспорта), но SMS с несколькими телефонами даёт несколько
    записей с одним и тем же `transport` — переключатель канала и стейт выбора переведены на составной
    `key` (`` `${transport}|${chatId}` ``, тот же ключ что и в `channelOptions.ts`), а не на голый
    `transport`, иначе при 2+ телефонах селектор не мог бы отличить один от другого.
    **Шаблоны SMS из TargetSMS**: добавлен `TargetSmsClient.getTemplates()` (`type: 'list_patterns'`
    из JSON API) и `GET /api/integrations/targetsms/templates` — открыт всем залогиненным (не
    `requireRole('admin')`, как `/targetsms/test`), потому что шаблон выбирает менеджер в момент
    отправки, а не админ в настройках. В `MessagesTab` при выборе SMS-канала подгружается список
    шаблонов; выбор шаблона подставляет текст в поле с заменой `{имя}` на имя контакта (тот же приём,
    что `renderInvoiceTemplate` для счетов) — текст остаётся редактируемым перед отправкой, шаблон не
    отправляется напрямую.
59. **`/chats` и `/email` не скроллились к последнему сообщению при открытии переписки** (июль 2026):
    бэкенд отдаёт сообщения в правильном хронологическом порядке (`orderBy: asc`), но обе страницы
    рендерили список без скролла к низу — при открытии чата/треда с длинной историей было видно
    самое старое сообщение, а не последнее. Карточка сделки (`DealDetail.tsx`) этот паттерн уже
    использовала (`bottomRef` + `scrollIntoView` в `useEffect` по длине списка сообщений), в отдельные
    страницы `/chats` и `/email` его просто не перенесли при их создании. Фикс — тот же `bottomRef`,
    эффект зависит от `[selectedContactId/selectedThread, messages.length]`, чтобы срабатывать и при
    открытии другого чата, и при новом входящем/исходящем сообщении в уже открытом.
60. **`Message.channelId`/`Message.chatId` — какой ИЗ НАШИХ WazzUp-каналов и какой идентификатор
    КЛИЕНТА использованы для конкретного сообщения** (июль 2026): раньше подпись над сообщением
    («Чаты», вкладка «Сообщения») показывала только транспорт (`✈️ Telegram`) — при нескольких
    WazzUp-каналах одного транспорта (два Telegram-бота/номера школы) было невозможно понять, через
    какой ИЗ НИХ ушло/пришло сообщение, и на какой номер/аккаунт клиента. Оба поля раньше нигде не
    сохранялись — резолвились на лету и терялись. `channelId` — WazzUp `channelId` (резолвится в
    `wazzupClient.sendMessage()`, теперь возвращается в результате `{ ...response.data, channelId }`,
    прокидывается через `sendViaTransport()`); `chatId` — сырой WazzUp `chatId`, использованный для
    ИМЕННО этого сообщения (на входящих — `entry.chatId` из вебхука, на исходящих — то, что вернул
    `resolveRecipient()`). Записываются в 6 местах создания `Message` (входящий вебхук,
    `sendMessageToContact`, отложенная отправка + её воркер, напоминания о пробных, автоматизации) —
    где получатель известен ДО создания строки, пишется сразу в `create`; где `channelId` известен
    только после ответа WazzUp — отдельным `prisma.message.update()`, тем же паттерном, что уже
    использовался для `wazzupId`. Фронтенд — новый `messageChannelLabel()` в `lib/channelOptions.ts`
    (используется и «Чатами», и `DealDetail.tsx`): `✈️ Telegram — bot_sales → клиент +79001234567`,
    деградирует до обычного `transportLabel()` при отсутствии данных (старые сообщения до миграции).
    **Известное ограничение, не решаем сейчас**: `chatId` НЕ форматируется — для WhatsApp/SMS это и
    так телефон, но для уже установленного личного Telegram/MAX-чата это непрозрачный внутренний ID
    WazzUp, конвертировать в телефон нельзя (ограничение самого API).
61. **Каналы напоминаний настраиваются отдельно ДЛЯ КАЖДОГО офсета, не только для урока целиком**
    (июль 2026): `TrialReminderOffset` (`packages/shared/src/types/trial.ts`) получил `channels?:
    string[]` — точные транспорты (не сгруппированные "Telegram", а конкретные ключи из
    `TRANSPORT_LABELS`, чекбоксы на `/settings/trials`). Мотивация — экономия на SMS: длинный текст
    (например, напоминание за сутки) не должен уходить по SMS, если это не нужно, при превышении 70
    символов SMS тарифицируется как несколько сообщений (добавлен счётчик символов с amber-предупреждением
    в UI, срабатывает при `len > 70` И (`sms` в `channels` ИЛИ `channels` пуст — пустой список = "все
    каналы урока", включая SMS, ради обратной совместимости со старыми офсетами). В `worker.ts`
    `sendReminder()` теперь принимает весь `offset`, а не `(minutes, template)`: `targets` — пересечение
    `trialReminderTargets(trial)` и `offset.channels` (пустой `offset.channels` = без фильтра, как
    раньше). **Email добавлен как канал только в UI** (чекбокс на офсете + `emailOptions(contact)`
    подмешивается в список каналов при записи на пробный в `TrialLessonCard.tsx`) — реальной отправки
    email для напоминаний ещё нет (`sendViaTransport` не умеет слать email, только `sms`→TargetSMS,
    остальное→WazzUp). При срабатывании офсета с email в `channels` вместо `sendViaTransport` сразу
    пишется `Message{status:'error', errorMsg:'Email-напоминания пока не реализованы'}` — **email
    исключён из retry-guard** (`retryable = targets.filter(t => t.transport !== 'email')`, ретрай
    BullMQ триггерится только по `sentCount === 0 && retryable.length > 0`), иначе офсет с
    единственным email-каналом ретраился бы 3 попытки, а потом ещё и sweep пытался бы его повторно
    слать каждые 5 минут бесконечно, раз `remindersSent` никогда не заклеймился бы успешно.
62. **Перенос прод-сервера на новый VPS/домен (июль 2026, миграция на crm.example.com) — прошёл
    успешно**, дополнительно к раннбуку `docs/vps-migration.md` всплыли три процессные ловушки:
    - **Спутать SSH-сессии старого/нового сервера в окне простоя легко** — команды (`docker compose
      stop api web` и т.п.) синтаксически идентичны в обеих сессиях `deploy@.../crm`. Остановка
      `api`/`web` на НОВОМ сервере до реального переключения безвредна (он ещё не принимает боевой
      трафик, `postgres`/`redis` не трогаются, `api`/`web` без своего стейта) — чинится обычным
      `docker compose up -d api web`. На будущее — подписывать вкладки терминала по хосту (hostname
      в PS1 или заголовке вкладки), не полагаться на память при повторяющихся командах в двух похожих
      сессиях подряд.
    - **`scp host_A:file host_B:file` без флага `-3` копирует НАПРЯМУЮ между двумя удалёнными
      хостами** — сервер-источник сам открывает SSH-соединение к серверу назначения СВОИМ ключом, а
      не ключом машины, с которой запущен `scp`. Между старым и новым VPS никакого SSH-доверия нет
      (и не должно быть) — падает `Permission denied (publickey)` на стороне назначения. Фикс —
      `scp -3 host_A:file host_B:file` (трафик реально идёт через локальную машину, использует её
      ключи к обоим хостам) либо перенос в два шага (`scp host_A:file ./` → `scp ./file host_B:file`).
    - **Свежий `adduser deploy` НЕ получает `authorized_keys` автоматически** — провайдер кладёт ключ
      для входа только в `/root/.ssh/authorized_keys`; `/home/deploy/.ssh/authorized_keys` пустой,
      пока не скопирован вручную. Поэтому `ssh root@IP` → `su - deploy` работает (сессия наследует
      доверие root, свой ключ не нужен), а прямой `ssh deploy@IP`/`scp ...deploy@IP:...` с ноутбука
      падает `Permission denied (publickey)`. Фикс — сразу в шаге 1 `vps-migration.md`, после
      `adduser deploy`:
      ```bash
      mkdir -p /home/deploy/.ssh
      cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
      chown -R deploy:deploy /home/deploy/.ssh
      chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
      ```
    - **`pg_restore` без `--verbose` молчит при УСПЕШНОМ восстановлении** — отсутствие вывода после
      `docker compose exec -T postgres pg_restore ... < dump` само по себе не признак ни зависания,
      ни ошибки. Подтверждать успех не по «тишине», а по `echo $?` (0) и реальным счётчикам строк
      (`select count(*) from "Deal"/"User"`), как и было в исходном раннбуке — при разборе ошибок
      добавлять `--verbose` для видимого прогресса.
63. **Экспорт сделок в CSV/Excel — admin-only, прямой blob-download, без стриминга** (июль 2026,
    B4/Волна 3, экспорт-часть; импорт из amoCRM отдельной итерацией не начат): `GET
    /api/deals/export?format=csv|xlsx&search=&pipelineId=&stageId=&assigneeId=` в `deals.ts`
    (роут-литерал `/export` заведён ДО `GET /:id`, иначе Express принял бы «export» за id) отдаёт
    все совпавшие сделки одним ответом — `csv-stringify` (`bom: true`, чтобы кириллица не превращалась
    в кракозябры при открытии в Excel) или `exceljs` (лист «Сделки»). Колонки — фиксированные поля
    сделки и **полные данные привязанного контакта, включая его ID** (по явному запросу — сделки
    остаются единственной выгружаемой сущностью в этой итерации, но тянут контакта целиком, не только
    имя), плюс кастомные поля сделки и контакта отдельными колонками (`select`/`multiselect` →
    человекочитаемый label через `field.options`, не сырой `value`; поля контакта — с префиксом
    `Контакт: `, чтобы не пересекаться по названию с одноимённым полем сделки) — логика в новом
    `services/export/deals.ts` (`buildDealExportRows`). **Доступ — только `admin`**: экспорт отдаёт
    данные по всем менеджерам разом, а ролевой видимости «менеджер видит только своё» в проекте нет
    нигде (`deals.ts`/`contacts.ts`/`companies.ts` — чтение везде открытое), так что массовая выгрузка
    — заметно большая поверхность раскрытия, чем обычный просмотр списка; кнопки на `/deals` тоже
    скрыты не-админам (`useAuthStore().user.role`), хотя это чисто UX-скрытие поверх серверной
    проверки. Без ограничения на число строк — при масштабе проекта (до 10 000 сделок) CSV/XLSX
    такого объёма собираются в рамках одного запроса без стриминга. **Новый паттерн скачивания
    файла**: раньше в проекте был только один способ — signed S3 URL + `window.open` (вложения
    email); для генерируемого на лету файла это не подходит, поэтому `dealsApi.exportDeals` шлёт
    `apiClient.get(..., { responseType: 'blob' })`, а `/deals/page.tsx` создаёт `URL.createObjectURL`
    + временный `<a download>` + `.click()` — если понадобится экспорт для контактов/компаний
    (B4 — в бэклоге), переиспользовать этот же клиентский паттерн. Новые зависимости бэкенда:
    `exceljs`, `csv-stringify` — до этой правки в проекте не было ни одной CSV/Excel-библиотеки.
64. **Конверсии в аналитике — воронка по этапам и пробный→оплата** (июль 2026, A7, конверсионная
    часть; renewal rate/LTV/churn/источники добавлены следом, см. замечание 65; выручка по языкам —
    не начата): в `GET /api/analytics/pipeline/:id` добавлены `funnel` и
    `summary.trials.trialToPaymentRate`.
    **Метод расчёта воронки — по ТЕКУЩЕМУ положению сделки, не по истории `Activity`**: сделка
    считается «дошедшей» до этапа N, если её нынешний `stage.order >= N` (суффиксная сумма по
    отсортированным этапам). Осознанное упрощение — не видит сделок, которые прошли этап и
    откатились назад; лечится только парсингом `Activity{type:'stage_change'}` по каждой сделке,
    что дороже и не гарантированно полно (не все переносы логируются одинаково, см. риск в
    замечании 50 про доверие к необследованному формату). Lost-этапы исключены из лестницы —
    неизвестно, докуда дошла отказавшаяся сделка, это уже отдельно видно через `winRate`/
    `lostReasons`. Счётчик по этапам для воронки — отдельный `groupBy` с `dateFilter` (в отличие от
    `stages[]._count.deals`, который его игнорирует и остаётся как есть для существующего
    бар-чарта «Сделки по этапам» — сознательно не трогали старое поведение, чтобы не сломать другой
    виджет). **Конверсия пробный→оплата считается через `Subscription`, а не `Payment.status=
    'succeeded'`**: ручная оплата наличными/переводом (A1) создаёт `Subscription` без `Payment` —
    если бы мерили по `Payment`, конверсия была бы занижена для школ без онлайн-оплаты. На
    странице `/analytics` уже был мёртвый импорт `FunnelChart`/`Funnel`/`LabelList` из recharts —
    задел под эту фичу, доведён до использования.
65. **Retention (LTV/renewal/churn) и источники (UTM) в аналитике** (июль 2026, A7, продолжение
    замечания 64): `summary.retention` и `utmSources` в `GET /api/analytics/pipeline/:id`.
    **Retention НЕ фильтруется по `dateFilter`** (в отличие от всех остальных метрик роута) —
    осознанно: это метрика жизненного цикла ученика (сколько всего он принёс денег, продлевает ли
    абонементы), а не сделок, созданных за выбранный период; фильтровать её тем же диапазоном дало
    бы обрезанную и вводящую в заблуждение картину. **LTV** — средняя сумма ВСЕХ подписок
    (включая `canceled` — деньги за них уже приняты, отмена не откатывает `Payment`) на ученика
    среди учеников, у которых есть хотя бы одна сделка в этом пайплайне (join через
    `Subscription.contact.deals`, не `Subscription.dealId` — у подписки сделка-источник
    опциональна, а вот у контакта их может быть несколько за пределами этого пайплайна, что и
    отсекается фильтром). **Renewal/churn** — упрощённая модель без проверки порядка подписок во
    времени: контакт считается «продлившим», если среди его подписок есть хотя бы одна ЗАВЕРШЁННАЯ
    естественно (`status: exhausted`, или `active` с `expiresAt` в прошлом — та же формула, что
    `isExpired()` в `services/subscriptions/index.ts`, но БЕЗ живого пересчёта в БД, `canceled` не
    считается завершением) И при этом у него 2+ подписки всего; `churnRate = 100 - renewalRate`
    (тот же знаменатель — учеников с завершённой подпиской, а не все ученики). Известная неточность:
    ученик с 2 подписками, ОБЕ из которых ещё активны (например, докупил впрок), тоже засчитается
    как «продливший» — это редкий кейс на масштабе школы, отдельно не разбирали. **Источники
    (`utmSources`)** — единственная метрика роута на raw SQL с `Prisma.sql`/`Prisma.empty` (условный
    `AND`-фрагмент под `from`/`to`, до этой правки `Prisma.sql` в файле не использовался, хотя
    паттерн уже применяется в `leads.ts`/`engine.ts`): группировка по `custom_fields->>'utm_source'`
    с `COALESCE(NULLIF(...), 'Без источника')` — пустая строка из старых лидов схлопывается в ту же
    группу, что и полное отсутствие поля. Источник заполняется только через `POST /api/leads` (A6) —
    сделки, заведённые вручную с канбана, всегда попадают в «Без источника», это ожидаемо, не баг.
66. **Гибкие роли и права: `requireRole` заменён на `requirePermission`, роли — записи в БД**
    (июль 2026): модель `Role {name unique, permissions String[], isSystem}` + `User.roleId` FK +
    `User.active`; строковая колонка `User.role` УДАЛЕНА миграцией `roles_permissions` (бэкфилл:
    admin/teacher → одноимённые системные роли, всё остальное → manager). Справочник из 12 ключей
    прав — `packages/shared/src/constants/permissions.ts` (`PERMISSIONS` с русскими лейблами для
    чекбоксов, `ALL_PERMISSIONS`, тип `PermissionKey`). Ключевые решения:
    - **Резолв прав — по userId из БД с кэшем 60с** (`services/roles/permissions.ts`, один
      `Map<userId, Set>` на всю таблицу юзеров — паттерн `payments/settings.ts`), НЕ из JWT: правка
      матрицы применяется без re-login. `invalidatePermissionsCache()` дёргают все мутации
      `/api/users` и `/api/roles`. В JWT `role` остался именем роли (информационно) — старые токены
      парсятся. Два окна устаревания: 60с серверный кэш + клиентский стор до рефетча `/auth/me`
      (дашборд-layout рефетчит его раз за сеанс на mount).
    - **Системная роль admin получает `ALL_PERMISSIONS` из кода** (ветка в `getPermissions`), список
      в БД — для отображения: новый ключ права не требует миграции данных. PATCH/DELETE системного
      admin → 403; у системных manager/teacher можно менять permissions, но не имя.
    - **`requireRole` удалён из `middleware/auth.ts`** — вместо него `requirePermission(perm)`
      (async! резолвит из кэша) и хелпер `userHasPermission(userId, perm)` для инлайн-проверок.
      Маппинг старых гейтов: settings.crm (pipelines/fields/automations/packages/lost-reasons +
      ключ `trial_reminders` в PUT integrations/settings — тернарник в хендлере), settings.integrations
      (остальные настройки + email-accounts + маска секретов), trash.manage (DELETE deals/contacts/
      companies + весь /trash), finance.manage (бывший financeRole), deals.export, users.manage
      (новые /api/users и /api/roles). НОВЫЕ гейты, которых раньше не было: `entities.edit` на
      POST/PATCH deals (вкл. /stage), contacts (+phones/emails), companies — задачи/сообщения/
      пробные/заметки сознательно открыты всем; `section.analytics|email|chats` — router.use на
      целых роутерах (раньше только auth).
    - **`data.viewAll` заменил инлайн `role === 'admin'`** в data-скоупинге чатов
      (`services/chats/access.ts`, `routes/chats.ts`) и почтовых ящиков (`services/email/access.ts`,
      `email-accounts.ts`) — `canAccessAccount` стал async, вызовы через await. Семантика «admin
      видит всё» сохранена через это право у системного admin.
    - **Деактивация вместо удаления юзера**: DELETE /api/users нет (FK от Deal/Task), `active: false`
      блокирует login (403) и refresh (401 — refresh теперь перечитывает юзера из БД, заодно
      подхватывая смену роли); access-токен доживает свои ≤15 мин — осознанно, authMiddleware
      остался без запроса в БД. `GET /auth/users` (пикеры) отдаёт только active и добавил
      `isTeacher` (право `lessons.teach` у роли) — фильтр `role === 'teacher'` в SubscriptionCard
      заменён на него. Guard: самодеактивация → 400.
    - **Фронтенд**: `user.permissions` приходит из login/`/auth/me`; хук `useHasPermission()` в
      `auth.store.ts`; сайдбар-пункты получили `permission`/`permissionsAny` вместо `adminOnly`
      (href «Настроек» — первая доступная страница); settings-layout скрывает группы CRM/Интеграции/
      Доступ по правам; страница `/settings/users` (users.manage) — юзеры (создание/смена роли/
      сброс пароля через prompt/деактивация) + роли (чекбокс-матрица из PERMISSIONS). Persisted-стор
      старых сессий без `permissions` лечится тем же рефетчем /me. В DEMO_MODE пункт «Пользователи»
      скрыт (demo-adapter не знает /users), сам рефетч /me в демо не выполняется.
    - **Ловушка на будущее**: новый мутирующий роут = сразу выбрать ключ права из PERMISSIONS (или
      добавить новый ключ в shared + в матрицы ролей через UI), а не копировать соседний гейт не
      глядя; у view-only ролей (без entities.edit) любые UI-потоки, патчащие сделку (пробные,
      счета), получат 403 — это задумано.
67. **Массовое удаление/экспорт (чекбоксы) + перенос сделок при удалении этапа** (июль 2026):
    - `POST /api/{deals,contacts,companies}/bulk-delete` (`{ids: string[]}`, `trash.manage`) — тот же
      soft-delete, что и одиночный `DELETE /:id`, просто через `updateMany`. Deals-версия дополнительно
      пишет `Activity` на каждую сделку и эмитит `DEAL_DELETED` в её `pipeline:{id}` комнату (канбан
      других пользователей скрывает карточки без ручного рефреша). Чекбоксы + плавающий тулбар —
      на `/deals`, `/contacts`, `/companies` (список) и прямо на канбане (кнопка «Выбрать» переключает
      `selectionMode`, в котором клик по карточке выделяет вместо открытия, а drag на
      карточке отключается через `disabled` в `useSortable` — см. `DealCard.tsx`).
    - `GET /api/deals/export` принимает `ids` (через запятую) — при наличии игнорирует остальные
      фильтры и экспортирует только перечисленные id; остаётся тем же эндпоинтом, что и «экспорт всех
      по фильтру» (замечание 63), не отдельный роут. Контактов/компаний экспорт по-прежнему нет
      (см. ROADMAP B4) — для них реализовано только массовое удаление, не выгрузка.
    - **Удаление этапа с сделками теперь требует выбрать целевой этап** вместо тихого (и на самом деле
      битого — FK-ограничение на `Deal.stageId` без `onDelete` бросало необработанную ошибку, роут был
      без try/catch) удаления. `GET /pipelines/stages/:id/deletion-check?targetStageId=` считает
      активные сделки в этапе и, если целевой этап уже выбран, какие `requiredAtStageIds`-поля целевого
      этапа не заполнены у скольких сделок — фронт (`DeleteStageDialog` в `settings/pipeline/page.tsx`)
      показывает это как предупреждение (не блокирует). `DELETE /pipelines/stages/:id?targetStageId=`
      считает сделки БЕЗ фильтра `deletedAt` (иначе не отловленные в UI сделки из корзины всё равно
      уронят FK при `stage.delete`), при наличии переносит их `updateMany` на целевой этап того же
      pipeline (кросс-pipeline перенос не поддержан — целевой этап всегда из `otherStages` той же
      воронки) и проставляет `closedAt`/`lostReasonId` по типу целевого этапа (та же семантика, что в
      `applyStageMove`), без запуска автоматизаций — массовый админский перенос не должен спамить
      триггеры на каждую сделку. Единственный этап с сделками и без альтернативы — диалог блокирует
      кнопку «Удалить» (`otherStages.length === 0`).
    - Мышь без трекпада на канбане: `onWheel` в `KanbanBoard.tsx` переводит `deltaY` в `scrollLeft`
      (стандартный паттерн Trello/Notion), плюс класс `.kanban-scroll` в `globals.css` держит
      `::-webkit-scrollbar` всегда видимым и потолще — раньше горизонтальная полоса скролла пряталась
      до наведения и была едва цепляемой мышью.
68. **Дедупликация контактов/компаний** (июль 2026): `services/dedup/{contacts,companies}.ts`.
    - **Критерии совпадения**: контакты — телефон ИЛИ email (основной + все доп. `ContactPhone`/
      `ContactEmail`), телефон сравнивается по цифрам (`phoneDigits`, та же нормализация 8→7, что и
      везде в проекте) — совпадает, даже если один хранится как `+7999...`, а другой как `8 (999)...`.
      Компании — точное имя без учёта регистра (`trim().toLowerCase()`), без нормализации юр.формы.
    - **`GET /api/{contacts,companies}/duplicates`** (`trash.manage`, только admin): полная выгрузка
      всех недалённых записей + группировка в JS (BFS по графу совпадений для контактов — телефон ИЛИ
      email могли зацепить разные пары, отсюда переходность: A~B по телефону, B~C по email → одна
      группа ABC; для компаний — простая группировка по нормализованному имени). Full-table scan —
      `ponytail:` в коде, при росте базы далеко за 10к контактов заменить на нормализованную колонку
      с индексом; на масштабе проекта (до 10 000 сделок) не проблема.
    - **`POST /api/{contacts,companies}/merge`** (`{ids, strategy: 'newest'|'oldest'}`, `trash.manage`):
      «выживает» запись, выбранная стратегией (новая/старая по `createdAt`) — той же стратегией
      разрешаются конфликты скалярных полей (`phone/email/telegramUsername/companyId` у контакта):
      сначала берётся значение survivor, если пусто — первое непустое среди остальных В ТОМ ЖЕ
      порядке сортировки по стратегии. Если основной телефон/email заполнен у ОБОИХ и значения
      различаются — проигравшее значение не теряется: добавляется survivor'у как дополнительный
      `ContactPhone`/`ContactEmail` (после дедупа по нормализованному значению, чтобы не задвоить,
      если оно и так уже есть среди телефонов/email survivor'а). `custom_fields` — shallow-merge,
      survivor's ключи в приоритете.
      Связанные записи (`Deal/Task/Message/Subscription/Payment.contactId`, `Contact/Deal/Task.companyId`
      у компаний) переносятся на survivor через `updateMany` внутри `$transaction`. `ContactPhone`/
      `ContactEmail` просто переносятся (дублей по значению не боимся, `no unique constraint`), а вот
      `ContactChannel` имеет `@@unique([contactId, transport])` — при коллизии транспорта (оба контакта
      писали в один и тот же WhatsApp/Telegram) канал проигравшего просто дропается, а не переносится
      (P2002 иначе уронил бы всю транзакцию). Проигравшие уходят через обычный soft-delete
      (`deletedAt`) — тот же путь, что и корзина (замечание 41), 30-дневный auto-purge их подхватит
      сам, отдельная логика не нужна.
    - **Защита при создании (`force`-флаг)**: `POST /api/{contacts,companies}` без `force: true` в
      теле сначала ищет совпадения; если находит — `409 {error: 'duplicate_contact'|'duplicate_company',
      matches}` вместо создания. Фронт (`CreateContactModal`, `CreateCompanyModal`, и inline-форма
      создания контакта в `AttachContactCard` внутри `DealDetail.tsx`) ловит 409 и показывает найденные
      записи с кнопкой «Открыть»/«Привязать» (в карточке сделки — сразу привязывает найденный контакт
      к сделке через уже существующий `attachMutation`, без создания нового) и «Всё равно создать»
      (повторный запрос с `force: true`). Права на сам POST не менялись (`entities.edit` — доступно
      менеджерам), проверка дублей — не отдельное право, а часть того же роута.
    - **UI поиска/объединения** (`/contacts`, `/companies`, кнопка «Найти дубли», видна только при
      `trash.manage`): диалог с группами, чекбоксы (по умолчанию отмечены все в группе), выпадающий
      список стратегии на каждую группу отдельно (не глобальная настройка — админ каждый раз выбирает
      осознанно). После успешного merge карточка группы скрывается сразу (`mutation.isSuccess`), не
      дожидаясь рефетча — `invalidateQueries(['contacts'])`/`(['companies'])` по префиксу задевает и
      сам `['contacts','duplicates']`, так что список тоже обновляется без лишнего кода.
69. **Пагинация списков — только через `lib/pagination.ts` (`parsePagination`)** (июль 2026, из
    `docs/tech-stack-review.md`): раньше каждый список парсил `Number(req.query.limit)` без верхней
    границы — `?limit=999999` обходил пагинацию целиком (self-DoS на большой базе).
    `parsePagination(req.query, defaultLimit?)` клампит `limit` в [1, 200] и `page` ≥ 1; используется
    в списках deals/contacts/companies/tasks и тредах email. Новый списочный роут — сразу через
    хелпер, не копировать старый `Number(limit)`-паттерн. Тем же заходом добавлены индексы под
    дефолтную сортировку списков (миграция `list_sort_indexes`: `@@index([deletedAt, createdAt])`
    на Deal/Contact/Company, `[dealId, createdAt]` на Activity, `[contactId, createdAt]` + `[readAt]`
    на Message) и `?connection_limit=20` в DATABASE_URL прод-compose (дефолтный пул Prisma cpus×2+1
    мал для ~100 одновременных пользователей). Остальные узкие места масштаба (канбан без лимита,
    экспорт в память, «Чаты» без пагинации, нереализованный Redis-кэш аналитики) сознательно НЕ
    закрыты этим заходом — приоритизированный план в `docs/tech-stack-review.md`.
70. **Demo-стенд (`DEMO_MODE`) отставал от прода на несколько волн фич** (июль 2026): `apps/api/prisma/seed-demo.ts`
    создавал юзеров через `role: 'admin'|'manager'|'teacher'` — поле, удалённое миграцией `roles_permissions`
    (замечание 66, `User.role` → `User.roleId`). Seed падал с TS/Prisma-ошибкой ещё до вставки данных — демо-стенд,
    вероятно, не наполнялся вовсе. Фикс — `roleId: 'role_admin_system'|'role_manager_system'|'role_teacher_system'`
    (те же фиксированные id системных ролей, что использует бэкфилл-миграция). Заодно в `lib/demo/handlers.ts`
    (мутации в demo-режиме перехватываются в браузере целиком, см. Часть 2 плана демо-стенда) добавлены два
    отставших маршрута: `DELETE /pipelines/stages/:id?targetStageId=` теперь переносит сделки на целевой этап
    (closure-семантика как у `applyStageMove`) вместо простого удаления без учёта связанных сделок (замечание 67);
    `POST /{contacts,companies}/merge` — объединение дублей по стратегии newest/oldest, конфликтующий телефон/email
    контакта не теряется (замечание 68). **Упрощение**: merge переносит на survivor только сделки — задачи/
    сообщения/абонементы/платежи проигравшего в демо остаются висеть на нём (`ponytail:`-комментарий в коде,
    апгрейд — добавить туда те же apiClient.get+patch по образцу deals). `adapter.ts` для этого научили
    прокидывать axios `config.params` в demo-хендлеры (раньше терялись — единственный существующий вызов с
    query-параметрами на мутации, `stagesApi.delete`, тоже был сломан). **Ловушка на будущее**: GET-эндпоинты
    в demo идут напрямую на реальный бэкенд demo-стенда и работают «бесплатно» при появлении новых фич (экспорт,
    аналитика, пагинация) — обновлять `handlers.ts` нужно только под НОВЫЕ мутации; при добавлении фичи с
    мутирующим роутом сверяться с этим списком, не считать демо синхронизированным по умолчанию.
71. **Теги сделок/контактов** (июль 2026): `Deal.tags`/`Contact.tags` — простой `String[] NOT NULL
    DEFAULT '{}'` (не отдельная модель-справочник, как `LostReason`) — теги свободные, без цвета/
    прав/переиспользуемого id, поэтому обычный скалярный массив плюс `hasSome`-фильтр Prisma
    (индексируется GIN нативно на масштабе проекта не требуется, обычный seq scan на ≤10k строк
    не проблема — заводить индекс, если фильтр по тегам станет частым на большей базе). Автокомплит —
    `GET /api/{deals,contacts}/tags` (`SELECT DISTINCT unnest(tags) ...` raw SQL, роут зарегистрирован
    ДО `GET /:id`, как `/export`/`/duplicates`). Редактирование — `TagInput` (`components/entity/
    TagInput.tsx`, чипы + автокомплит по тем же suggestions) переиспользуется и для правки тегов
    (DealDetail, `/contacts/[id]`), и для мультиселект-фильтра в списках (`/deals`, `/contacts`) —
    это один и тот же UI-паттерн «набор строк», разница только в источнике suggestions и что делает
    onChange. Фильтр — `?tags=a,b` в query, `where.tags = {hasSome: [...]}`. **Демо-режим**: свежесозданные
    в оверлее сделки/контакты получают `tags: []` через `defaults` в `registerCrud()` (`lib/demo/
    handlers.ts`) — без этого чтение `.tags.length` на только что созданной в демо сделке падало бы
    (реальный GET всегда отдаёт `tags`, но синтетический create-объект оверлея — только то, что
    передали в `defaults`/body). Тегов в `CreateDealModal`/`CreateContactModal` при создании нет
    (только после — через редактирование), это осознанный пропуск ради меньшего диффа.
72. **Аутентификация переведена на httpOnly cookie + CSRF + ротацию refresh-токенов** (июль 2026,
    Волна 2 аудита, закрывает A3/A4/A10/A12): раньше access/refresh JWT лежали в `localStorage` —
    XSS на любой странице мог украсть refresh-токен целиком (30 дней жизни) и переиспользовать его
    бесконечно, отозвать его было нечем.
    - **Cookies**: `access_token`/`refresh_token` — `httpOnly, sameSite=lax, secure=isProd, path=/`,
      выставляются `setAuthCookies()`/чистятся `clearAuthCookies()` (`lib/cookies.ts`). Парсинг
      `Cookie`-заголовка — свой мини-парсер (`parseCookieHeader`, десяток строк), не cookie-parser:
      писать cookie умеет сам Express (`res.cookie`), читать нужно было только в 3 местах
      (authMiddleware, csrf-мидлварь, роуты auth) — заводить зависимость под это было лишним.
      `authMiddleware` дополнительно принимает `Authorization: Bearer` как fallback (curl/скрипты,
      фронтенд им не пользуется).
    - **Ротация + отзыв** (`services/auth/sessions.ts`): у refresh JWT есть `jti`; активная сессия =
      ключ `refresh:{userId}:{jti}` в Redis с TTL = времени жизни refresh-токена. `POST /auth/refresh`
      сверяет `jti` с Redis, **удаляет старый ключ и выдаёт новый** (одноразовый refresh) — попытка
      повторно предъявить уже использованный refresh (replay украденного токена) ловится отсутствием
      ключа и **гасит ВСЕ сессии юзера** (`revokeAllSessions`, `redis.keys` по префиксу — ponytail:
      блокирующий скан, но набор сессий на юзера мал, апгрейд на SET при тесноте бюджета команд).
      `POST /auth/logout` отзывает конкретный `jti` (verify с `ignoreExpiration: true` — логаут должен
      снимать сессию даже с протухшим refresh) и чистит cookies. Смена пароля (`change-password`) тоже
      зовёт `revokeAllSessions` — форсирует re-login везде, включая текущую сессию.
    - **CSRF — double-submit cookie** (`middleware/csrf.ts`, `app.use(csrfProtection)` глобально перед
      роутами): `csrf_token` cookie специально НЕ httpOnly (иначе фронтенд не смог бы её прочитать),
      фронтенд отражает её значением заголовка `X-CSRF-Token` на каждый non-GET запрос
      (`lib/api/client.ts`, читает `document.cookie` напрямую). Сверка — `timingSafeEqual`. Исключения
      по префиксу пути: `/api/webhooks` (своя подпись), `/api/leads` (сторонние формы, X-Form-Key),
      `/api/auth/login` (сессии, а значит и csrf-cookie, ещё нет). `refresh`/`logout` ПОД защитой —
      сознательно, иначе чужой сайт мог бы форсировать ротацию/логаут жертвы без спроса.
    - **A10 — не блочить операционные данные**: изначальный порыв «читать интеграции могут только
      админы» ломал реальные фичи — `GET /wazzup/channels` дергают ЛЮБЫЕ менеджеры при отправке
      сообщения (NewMessageDialog/DealDetail/чаты), `GET /settings/payments` — `InvoiceDialog` при
      выставлении счёта. Оставлены открытыми: `wazzup/channels` целиком и ключ `payments` в
      `/integrations/settings/:key`. Остальные ключи (`targetsms_*`, `cloudpayments_*`, `robokassa_*`,
      `lead_form`, `trial_reminders`) теперь отдают `value` только тем, у кого есть `settings.crm`
      (для `trial_reminders`) или `settings.integrations` (остальные) — без права видно только
      `hasValue` (как уже было устроено для write-only секретов).
    - **Socket.io**: `io.use()` теперь читает `access_token` из `socket.handshake.headers.cookie`
      вместо `auth.token` (которого фронтенд больше не может передать — токен не виден JS). Работает
      cross-port в dev (`:3000` → `:4000`), потому что SameSite сравнивает **site** (eTLD+1), не порт —
      `localhost:3000` и `localhost:4000` cross-origin, но same-site, значит `SameSite=Lax` cookie
      всё равно уходит, если клиент шлёт `withCredentials: true` и сервер отвечает
      `Access-Control-Allow-Credentials` с явным (не `*`) origin — уже было настроено под `CORS_ORIGIN`.
      **Важно**: локальный dev без `CORS_ORIGIN=http://localhost:3000` в `.env` не пройдёт этот путь
      (сервер упадёт на `origin: '*'`, несовместимый с credentials) — `.env.example` уже требует это
      для прода, но раньше в dev можно было не задавать; теперь для рабочего сокета в dev — обязательно.
    - **Смена контракта фронтенда**: `authApi.login/refresh` больше НЕ возвращают `accessToken`/
      `refreshToken` в теле — только `{user}`. `auth.store.ts` хранит только профиль (`setAuth(user)`),
      токенов в сторе/localStorage больше нет вообще. `apiClient` — `withCredentials: true`, 401-хендлер
      дергает `/auth/refresh` без параметров (токен берётся из cookie) и ретраит исходный запрос.
    - **UI**: `/settings/profile` (смена пароля, политика — 8+ символов, буквы и цифры) — доступна
      ЛЮБОМУ залогиненному без гейта правом, поэтому пункт «Настройки» в сайдбаре теперь виден всем
      (раньше скрывался при отсутствии `settings.crm`/`settings.integrations`/`users.manage`);
      `settingsHref()` — цепочка фолбэков `pipeline → wazzup → users → profile`.
73. **Волна 3 аудита — defense-in-depth (июль 2026, закрывает A5/A7/A8/A13/A14 из `docs/security-audit.md`)**:
    - **A5 — авторизация сокет-комнат, но НЕ везде**: `join:chat`/`join:email`/`join:chats-inbox`
      (`socket/handlers.ts`) теперь проверяют доступ (`canViewContact`/`userHasPermission`), зеркаля REST
      того же раздела. `join:pipeline`/`join:deal` осознанно оставлены БЕЗ проверки — REST для
      сделок/воронок сейчас плоский (`GET /deals/:id` открыт любому залогиненному, см. IDOR-заметку в
      `security-audit.md` Волна 3), скоупить сокет строже, чем сам REST, дало бы рассинхрон UI (сделка
      видна по прямому запросу, но не обновляется в реальном времени). Если/когда решится owner-scoping
      для `manager` — прогнать `join:deal`/`join:pipeline` через тот же паттерн.
    - **A7 — глобальный rate limit**: `app.use('/api', apiLimiter)` в `index.ts`, 600 запросов/мин с
      одного IP, `skip` для `/api/webhooks/*` (провайдеры аутентифицируются подписью/токеном, не этим
      лимитером, и могут легитимно слать пачками). Существующие частные лимитеры (`/auth/login`,
      `/auth/refresh`, `/api/leads`) отдельно и строже — не трогали.
    - **A8 — honeypot, не CAPTCHA**: `leadSchema` в `routes/public/leads.ts` получил скрытое поле
      `website` — заполненное ботом-заполнятелем-всех-полей превращает запрос в тихий `201 {ok:true}`
      без создания Contact/Deal (не выдаём боту сам факт фильтрации). Полноценная CAPTCHA
      (hCaptcha/Turnstile) не заводилась — нужен внешний сервис и site key, не делали без явного запроса;
      `ponytail:`-комментарий в коде фиксирует потолок (не держит headless-бота, читающего разметку) и
      следующий шаг. Заметка про поле `website` добавлена на `/settings/lead-form` для тех, кто верстает
      форму лендинга.
    - **A13 — anti-replay без отдельной timestamp-инфраструктуры**: `messageId` от WazzUp уже уникален
      в БД (`Message.wazzupId @unique`) — `handleMessageEntry()` в `webhooks/wazzup.ts` теперь сначала
      проверяет, есть ли уже сообщение с этим `wazzupId`, и выходит ДО эмита `NEW_MESSAGE`/вызова
      `triggerAutomation`, если да. Раньше `upsert` делал идемпотентной только саму строку `Message` —
      побочные эффекты (сокет-эмит, автоматизации) при повторе вебхука срабатывали заново. `handleStatusEntry`
      не трогали — повтор там идемпотентен по значению (нет побочных эффектов, кроме лишнего сокет-эмита).
    - **A14 — валидация JSON-настроек на запись, не на чтение**: `PUT /api/integrations/settings/:key`
      валидирует форму `lead_form`/`payments` zod-схемой (`.strict()`) ДО записи в БД — невалидный JSON
      или незнакомое поле теперь `400` в момент сохранения (admin-only), а не молчаливый мусор, который
      потом ловит (или не ловит) каждый читатель по отдельности. `leads.ts:57` (`JSON.parse` без
      try/catch на `lead_form`) не трогали — раз запись гарантированно валидна, там больше нечему бросить.
    - **Осталось из Волны 3** (не трогали в этом заходе): IDOR/owner-scoping для `manager` (архитектурное
      решение, отдельная задача), инфраструктурные B2/B5-B8.
74. **«Чаты»: несматченные сообщения, пагинация, поиск** (июль 2026): `GET /api/chats` раньше жёстко
    фильтровал `contactId: { not: null }` — входящие, которые WazzUp не смог сматчить с контактом,
    были видны только в БД, не в UI (расходится с «Почтой», где такие письма и так попадают в общий
    инбокс через `threadKey = email внешней стороны`). Теперь роут дополнительно тянет отдельную
    группировку несматченных сообщений по `chatId` (`distinct: ['chatId']`, `contactId: null`) и
    мёржит с обычным списком по контактам в JS, сортируя по `lastMessage.createdAt` — два разных
    группирующих ключа (contactId vs chatId) не собрать одним Prisma-запросом. Несматченным чатам
    присваивается `id: 'unmatched:{chatId}'` (реальных `contactId` формата cuid с двоеточием не
    бывает — коллизий с реальными id нет) и `contactName: 'Неизвестный контакт'`; видны ВСЕМ
    менеджерам без исключения — у них нет `contactId`, а значит и сделки/assigneeId, по которому
    работает `canViewContact`, посчитать не от чего (та же ветка «нет сделок → видно всем», что уже
    была для контактов без сделок). Открыть переписку/ответить — новые роуты
    `GET /chats/unmatched/:chatId` и `POST /chats/unmatched/:chatId/messages`: транспорт для ответа
    не выбирается (нет контакта — нет каналов), а берётся из `channel` последнего сообщения того же
    `chatId`; отправка идёт через уже существующий `sendMessageToContact({contact: null, ...,
    explicitChatId: chatId})` — эта функция и раньше принимала `contact: null` (создание Message без
    контакта в `POST /deals/:id/messages` при слёте dealId), просто раньше никто не пользовался этим
    путём из «Чатов». **Пагинация**: `GET /api/chats` принял `parsePagination`/`search` по образцу
    `email.ts` (замечание 69) — но, в отличие от email-тредов, финальная сортировка/лимит применяются
    в JS ПОСЛЕ мёржа матченных и несматченных строк (`skip` на уровне Prisma не разложить на две
    разные группировки без потери порядка), поэтому реализован `limit`-only паттерн: фронт растит
    один `limit` и перезапрашивает целиком (без `skip`/склейки страниц) — на масштабе проекта (до
    10 000 сделок, до 50 менеджеров) это дешевле, чем городить курсорную пагинацию по гибридному
    списку. **Поиск** — по содержимому сообщения и (для матченных) имени/телефону контакта.
    Frontend (`chats/page.tsx`) получил то же самое поле поиска и кнопку «Показать ещё», что и
    `email/page.tsx` — заодно и там раньше не было способа догрузить сообщения старше первых 30,
    несмотря на то что бэкенд уже принимал `page`/`limit` (замечание 69); обе страницы теперь растят
    `limit` вместо страниц. Demo-режим: добавлен `POST /chats/unmatched/:chatId/messages` в
    `lib/demo/handlers.ts` — без него ответ в несматченный чат в демо ушёл бы напрямую на реальный
    demo-бэкенд (см. ловушку в замечании 70).
75. **nginx-хардненинг + Next.js 16/React 19 + `--omit=dev` в API-образе** (июль 2026, B6/B7/B8 из
    `docs/security-audit.md`):
    - **B6**: `nginx/nginx.conf` получил `server_tokens off`, `limit_req_zone`+`limit_req zone=api
      burst=20 nodelay` на `location /api/` (второй эшелон поверх Express-лимитеров — см. замечание
      19/73 про `/login`/`/refresh`/`/api/leads`/глобальный `/api`), явный список `ssl_ciphers`
      (Mozilla intermediate, применяется только к TLSv1.2 — TLSv1.3 использует свой набор) и
      `Content-Security-Policy` (`connect-src 'self'` — фронт и так ходит на `/api`/`/socket.io`
      через тот же origin по rewrites в `next.config.mjs`; `style-src 'unsafe-inline'` оставлен —
      Tailwind/Radix инлайнят стили в рантайме).
    - **B7 — апгрейд Next.js 14→16 (Turbopack по умолчанию) + React 18→19**: единственная страница
      с серверным-стайл `params`-пропом (`pipeline/[id]/page.tsx`, при этом `'use client'`) переведена
      на `useParams()` — тот же паттерн, что уже был в `deals/[id]`, `contacts/[id]`, `companies/[id]`;
      Next 16 делает `params`/`searchParams` промисом даже для клиентских page-компонентов, а
      `useParams()` эту проблему обходит целиком (используется весь проект, кроме этой единственной
      страницы, апгрейд просто унифицировал). **Транзитивные апгрейды, обязательные из-за React 19,
      не по желанию**: `lucide-react` 0.394→1.24 (0.394 объявлял peer `react` только до `^18`, апгрейд
      без смены использованных иконок/API) и `recharts` 2.12.7→2.15.4 (2.15 — первая ветка 2.x с
      `^19.0.0` в peerDependencies; recharts 3.x существует, но требует переписывания компонентов
      графиков — не делали, т.к. 2.15 закрывает задачу малой кровью). `eslint` 8→9 понадобился, т.к.
      `eslint-config-next@16` требует `eslint>=9` (в проекте нет ни `.eslintrc*`, ни `eslint.config.*`
      — линт фактически не запускается, апгрейд нужен был только чтобы `npm install` разрешился).
      **Ловушка при апгрейде монорепо-воркспейса**: инкрементальный `npm install` (без переустановки)
      оставил в корневом `node_modules` старую `react@18.3.1` рядом с новой `react@19.2.7` внутри
      `apps/web/node_modules` — сама по себе установка проходила, но `tsc`/`next build` падал с
      `TS2786 'XAxis' cannot be used as a JSX component ... missing props, state, setState` при любом
      classname-компоненте из старой библиотеки (recharts), т.к. TS резолвил `React.Component` из ДВУХ
      разных мест как несовместимые типы. Диагностика — `npm ls react` показывает дублирующиеся
      версии в дереве; фикс — полный `rm -rf node_modules apps/*/node_modules packages/*/node_modules
      package-lock.json && npm install` (чистая переустановка форсирует единый резолв версии на весь
      workspace). Если апгрейд мажорной версии React/Next в будущем снова покажет странные TS-ошибки
      именно в сторонних UI-библиотеках — сначала проверять дублирование `react` в дереве, а не баг
      в самой библиотеке.
    - **axios**: floor в `package.json` (оба воркспейса) поднят `^1.7.2` → `^1.8.2` (SSRF/leak-on-
      redirect фикс из CVE) — фактически резолвился уже `1.18.1` и раньше (диапазон `^1.7.2` это
      позволял), правка чисто декларативная — защита от случайного отката на уязвимую версию при
      будущем `npm install` с урезанным лок-файлом.
    - **Express 5 — только план, не мигрировали в этом заходе** (см. `docs/ROADMAP-full.md`, раздел
      «План миграции на Express 5»): главные ловушки — `path-to-regexp` v8 (синтаксис wildcard-роутов
      меняется) и то, что Express 5 сам ловит rejected promises в async-роутах (обесценивает часть
      ручных `try/catch + next(err)` из замечания 8, но убирать их нужно отдельным PR ПОСЛЕ апгрейда,
      не одновременно — иначе непонятно, что именно сломалось при регрессии).
    - **B8**: `prisma` (CLI) перенесён из `devDependencies` в `dependencies` `apps/api/package.json`
      — он нужен в рантайме (`CMD` контейнера делает `npx prisma migrate deploy` при каждом старте),
      просто раньше жил не в той секции. `apps/api/Dockerfile` добавил `RUN npm prune --omit=dev`
      сразу после сборки в builder-стадии, ДО копирования `node_modules` в runner — `typescript`/`tsx`/
      `@types/*` больше не едут в прод-образ, `prisma`/`@prisma/client` остаются (уже не dev).
      Проверено: `docker run crm-api npx prisma -v` работает (резолвится из `/app/node_modules` вверх
      по дереву от `WORKDIR /app/apps/api`, hoisting workspace'а этому не мешает), `tsc`/`tsx` в
      образе отсутствуют.
    - Оба образа (`crm-api`, `crm-web`) собраны и проверены локально (`docker compose build`), `tsc`/
      `next build` проходят чисто на обоих воркспейсах.
76. **Демо-стенд — ТОЛЬКО локальный запуск, отдельного демо-деплоя нет** (август 2026): стенд
    показывают с ноутбука, круглосуточный публичный демо-URL не нужен, поэтому вместо отдельной
    машины/хостинга — `npm run dev:demo` (корневой скрипт: обычный `npm run dev` + `DEMO_MODE=true`
    для api и `NEXT_PUBLIC_DEMO_MODE=true` для web) и `npm run db:seed:demo` (`prisma/seed-demo.ts`).
    Эксплуатация — `docs/demo-stand.md`. `NEXT_PUBLIC_DEMO_STAND_URL`/`NEXT_PUBLIC_MAIN_APP_URL`
    (кнопки «Демо режим»/«Выйти из демо») остались в коде как build-time env на случай, если демо
    когда-нибудь снова поедет на отдельный домен; локально не задаются, и кнопки просто скрыты.
    **Ловушка**: `NEXT_PUBLIC_DEMO_EMAIL`/`NEXT_PUBLIC_DEMO_PASSWORD` читает И фронтенд (форма
    авто-логина), И `seed-demo.ts` — если поменять их после засева, авто-логин упрётся в
    `401 Invalid credentials` при живом api (симптом «демо не пускает», а не «демо не поднялось»).
    - **Кросс-ссылки между демо и продом — только build-time env, не runtime-конфиг**:
      `NEXT_PUBLIC_DEMO_STAND_URL` (URL демо для кнопки «🎭 Демо режим» под формой логина обычной
      сборки) и `NEXT_PUBLIC_MAIN_APP_URL` (URL `/login` прода для кнопки «← Выйти из демо») идут
      тем же путём, что и сам `DEMO_MODE`. При локальном демо не задаются: первая кнопка тогда
      скрыта, вторая ведёт на свой же `/login` (дефолт `'/login'`) — ничего не ломается.
    - **Кнопка выхода — не просто ссылка**: `DemoBanner.handleExit()` сначала дёргает
      `authApi.logout()` (реальный `POST /auth/logout`, не перехватывается demo-адаптером — путь
      добавлен в `PASSTHROUGH` в `lib/demo/adapter.ts`, раньше туда шли только `/auth/login` и
      `/auth/refresh`, а logout молча проглатывался общим «нет обработчика мутации» фолбэком) и
      чистит zustand `auth.store`, и только потом `window.location.href` на другой домен — раз
      цель кросс-доменная, любой переход и так полностью перезагружает вкладку, но по требованию
      задачи сессия должна быть сброшена «даже если страница не перезагружена», поэтому logout
      идёт ДО навигации, а не полагается на неё.
    - **Демо гоняется на той же локальной базе, что и обычная разработка** — это безопасно ровно
      потому, что `demoGuard` не даёт мутациям дойти до Postgres: `seed-demo.ts` перезаписывает
      данные, дальше база read-only. Если нужна чистая — `docker compose -f docker-compose.dev.yml
      down -v` и заново `db:migrate` + `db:seed:demo`.
    - **Диагностика по экрану авто-логина**: `DemoAutoLogin` (`login/page.tsx`) шлёт
      `POST /auth/login` сразу при монтировании и показывает код и текст ответа.
      `401 Invalid credentials` = учётка/seed (см. ловушку выше), сетевая ошибка = api не запущен;
      форма логина вместо авто-логина = web поднят обычным `npm run dev` без
      `NEXT_PUBLIC_DEMO_MODE`.
    - **Третий класс ошибки на демо, найденный уже ПОСЛЕ обоих предыдущих: `304 Not Modified` на
      GET-запросах роняет вкладку целиком в нативную браузерную "This page couldn't load"** — не
      специфично для демо-кода, баг всего Express API (`apps/api/src/index.ts`), просто демо
      обнажает его чаще из-за дополнительного слоя merge (`lib/demo/merge.ts`) над каждым GET.
      Express по умолчанию генерирует `ETag` на JSON-ответы; при повторной навигации браузер шлёт
      `If-None-Match`, сервер отвечает `304` БЕЗ ТЕЛА — но ни `applyOverlayToGetResponse` (падает
      только если `data` truthy, то есть пропускает пустое тело как есть), ни компоненты дальше по
      цепочке (`.filter()`/`.map()` на предположительно всегда-массив) к пустому телу не готовы.
      Без единого `error.tsx` в приложении необработанное исключение в рендере валит ВСЮ React-
      дерево, и браузер показывает свой нативный экран (не наш UI) — выглядит как "страница не
      грузится", а не как баг конкретного компонента, что сильно затрудняло диагностику (см. чат:
      сначала заподозрили build-ID mismatch от передеплоев, потом cold start — оба were red
      herrings). Диагностировано по DevTools Network (статус `304` на `xhr`-запросах) + Console
      (`Uncaught TypeError: i.filter is not a function`). Фикс — `app.set('etag', false)` сразу
      после создания `app` в `index.ts`: своего HTTP-кэширования API не нужно, TanStack Query и
      так кэширует в памяти клиента; для demo — дополнительно защищает merge-слой, но чинит и
      прод/`crm-api` тем же способом (тот же Express-код, тот же дефолт). **Ловушка на будущее**:
      если где-то на проде тоже всплывёт "страница не грузится"/белый экран без видимой причины в
      нашем UI — сначала DevTools Console/Network, а не гипотезы про деплой/инфраструктуру;
      конкретно `304`+`Uncaught TypeError` на `.filter`/`.map` — это ровно этот баг, уже пофикшен,
      но стоит проверить, что фикс действительно в проде (redeploy).
    - **Четвёртый класс — тот же симптом (`Uncaught TypeError: i.filter is not a function`, вся
      вкладка падает в нативный экран браузера), но другая причина: демо-оверлей путает
      роут-литералы с `/:id`** — `lib/demo/merge.ts` матчит одиночный сегмент пути регулярками
      вида `^\/deals\/([^/]+)$`, рассчитанными на `/deals/:id`, но ТАК ЖЕ матчит `/deals/tags`,
      `/deals/export`, `/contacts/tags`, `/contacts/duplicates`, `/companies/duplicates` — те же
      литеральные под-роуты, которые на бэкенде специально зарегистрированы ДО `GET /:id` именно
      чтобы не быть перехваченными им (замечания 63/68/71). Ответ этих ручек (`string[]` тегов,
      blob экспорта, группы дублей) прогонялся через `mergeDealSingle`/`mergeContactSingle`/
      `mergeCompanySingle`, где `{...serverObj}` на массиве/blob даёт объект вида `{0:'vip',
      1:'urgent',...}` — TagInput (или другой caller, ожидающий исходный `string[]`) дальше падает
      на `.filter()` этого объекта. Найдено по трейсу, идентичному предыдущему пункту (`304`),
      но воспроизводилось уже ПОСЛЕ фикса ETag — при открытии карточки сделки (TagInput дёргает
      `/deals/tags` на автокомплит). Фикс — `LITERAL_SUBROUTES` в `merge.ts`: явный список
      литеральных сегментов на entityType, регэксп-ветка проверяет `!LITERAL_SUBROUTES[entity]
      .has(m[1])` перед вызовом merge-функции, литералы падают в `return data` без изменений
      (оверлей их не патчит — тот же принцип, что уже применён для `/trash`, `/chats`, `/email/
      threads` в комментарии над `applyOverlayToGetResponse`). **Ловушка на будущее**: у ЛЮБОЙ
      сущности, где на бэкенде появится новый литеральный под-роут `GET /<entity>/<literal>`
      (по образцу `/export`/`/tags`/`/duplicates`) — сразу добавлять его в `LITERAL_SUBROUTES` в
      `merge.ts`, иначе баг тот же самый, просто на новом пути; общая причина обоих классов (этот
      и `304`) одна — регэксп-роутинг демо-оверлея неявно предполагает, что единственный сегмент
      после `/deals/` это ВСЕГДА id сущности, и это предположение регулярно ломается.
77. **«Ошибка при проверке почты» — 500 из-за `BigInt` в JSON-ответе** (июль 2026):
    - **`GET/POST/PATCH /api/email-accounts(/:id)` падали 500 после первого успешного опроса
      IMAP** — роуты отдавали сырую Prisma-запись целиком (`{...rest}` после вычитания только
      паролей), а `EmailAccount.imapUidValidity` — `BigInt?` ([schema.prisma:330](apps/api/prisma/schema.prisma#L330)),
      который `imap-worker.ts` проставляет реальным значением при первом удачном подключении к
      ящику. `JSON.stringify`/`res.json()` не умеет сериализовать `BigInt` — исключение ловится
      общим `catch` и уходит в глобальный error-handler, который в production отдаёт только
      generic `{error: "Internal server error"}` (замечание 21) — маскирует настоящую причину
      полностью. Фикс — `imapUidValidity` исключается из ответа тем же способом, что и пароли
      (фронту оно и не нужно, в `FormState` такого поля нет). **Ловушка на будущее**: у любой
      Prisma-модели с `BigInt`-полем (в проекте это единственное такое поле, но если появятся
      новые) — при добавлении в JSON-ответ либо исключать явно, либо кастовать в `String`/`Number`
      до `res.json()`, иначе баг проявится не сразу (только после того, как поле реально
      заполнится ненулевым значением), что и произошло здесь.
78. **Socket.IO НЕ проксируется через Next.js — только напрямую на api или через nginx**: локально
    `socket.io-client` идёт по `NEXT_PUBLIC_WS_URL` на `api:4000` напрямую, на VPS — на тот же
    домен, где его перехватывает `location /socket.io/` в `nginx/nginx.conf`. Рерайтов `/socket.io`
    в `apps/web/next.config.mjs` намеренно НЕТ: `engine.io.attach()` перехватывает запрос, только
    если путь начинается РОВНО с `/socket.io/` (со слэшем), а Next по пути к бэкенду этот слэш
    теряет дважды — 308-редиректом до `rewrites()` и интерполяцией `'/socket.io/:path*'` при пустом
    `:path*` (у engine.io он всегда пустой, sid/EIO/transport идут в query). На api такой запрос
    падает мимо `engine.io` в Express-роутинг и ловит `404 {"error":"Not found"}`, а клиент вечно
    переподключается — realtime (канбан, статусы сообщений, «Чаты») ломается наглухо. **Ловушка на
    будущее**: если появится топология с Next.js перед Express (web и api на разных хостах без
    общего nginx) — не проксировать сокет рерайтами, а дать клиенту прямой WS_URL на api; при
    отладке «реалтайм не работает совсем» проверять `curl -v` путь `/socket.io/` С и БЕЗ слэша,
    раньше чем чинить CORS/куки/авторизацию сокета.
79. **`POST /email-accounts/:id/test` мог виснуть на минуты на недоступном хосте** (июль 2026):
    дефолтный `connectionTimeout` у
    `nodemailer` — 2 минуты, у `imapflow` — 90 секунд, а в `services/email/client.ts
    testConnection()` они идут ПОСЛЕДОВАТЕЛЬНО (сначала SMTP, потом IMAP) — в худшем случае запрос
    висел почти 3.5 минуты. Диагностировано по логу api: `morgan` пишет строку старта запроса
    (`POST .../test`), но НЕ пишет строку завершения (нет кода/времени/размера) даже спустя 4+
    минуты — обработчик реально не отвечал, а не падал с 500 сам. Тем временем nginx перед api
    терпит куда меньше и отдаёт браузеру `500`/`socket hang up` сильно раньше, пока сервер молча
    продолжает ждать в фоне (утечка висящего соединения на каждый клик). Фикс —
    `connectionTimeout: 10_000` на обоих клиентах (`transporterFor()` и `ImapFlow` внутри
    `testConnection()` — второй используется только для этой кнопки, не для `imap-worker.ts`,
    так что укорачивать таймаут именно там не сломало фоновый поллинг). На любом реально
    недоступном или закрытом фаерволом SMTP/IMAP-хосте кнопка теста без этого фикса зависала бы
    так же.
80. **Канбан: чекбокс «выбрать все сделки этапа» в шапке колонки** (июль 2026, дополнение к
    замечанию 67): в режиме выбора (`selectionMode`) в шапке каждой `KanbanColumn` рендерится
    чекбокс (виден только если в колонке есть хотя бы одна сделка) — клик выделяет/снимает
    выделение со всеми карточками этапа разом, вместо поштучного клика. Состояние чекбокса —
    `deals.every(d => selectedIds.has(d.id))`, обработчик `onSelectAllInStage(dealIds)` в
    `KanbanBoard.tsx` — тот же toggle-паттерн (если все уже выбраны — снять все, иначе добавить
    все) передаётся вниз пропом, сам `selected`-Set остаётся собственностью `KanbanBoard`.
    Ничего нового на бэкенде не потребовалось — использует существующие `bulk-delete`/`export`
    эндпоинты из замечания 67.
81. **Удаление этапа с трактованными сделками из корзины: попап показывал «сделок нет», а DELETE
    всё равно падал 409** (июль 2026, дополнение к замечанию 67): `GET .../deletion-check` считал
    `dealCount` только по активным сделкам (`deletedAt: null`), а `DELETE .../stages/:id` требует
    `targetStageId`, если на этап ссылается ХОТЯ БЫ ОДНА сделка вообще, включая уже лежащие в
    корзине (иначе `stage.delete` упал бы по FK). Если в этапе были только мягко удалённые сделки —
    попап показывал «Сделок в этапе нет, можно удалять» и звал `DELETE` без `targetStageId`, бэкенд
    отвечал `409 {error: 'deals_exist'}`, фронт показывал общий алерт «Не удалось удалить этап —
    попробуйте выбрать другой этап для переноса сделок», хотя выбора этапа в этот момент даже не
    предлагалось. Фикс — `deletion-check` также отдаёт `totalCount` (тот же счётчик без фильтра
    `deletedAt`, что использует сам DELETE), диалог (`DeleteStageDialog`) требует выбор целевого
    этапа по `totalCount > 0`, а не по `dealCount`, с отдельной репликой для случая «активных 0, но
    N в корзине».
82. **Результат задачи при выполнении — обязателен, не просто чекбокс** (июль 2026): `Task.result
    String?` (миграция `task_result`). `PATCH /api/tasks/:id` отдаёт `422 {error:
    'result_required'}`, если `completed: true` приходит без непустого `result` — переоткрытие
    задачи (`completed: false`) этим гейтом не ограничено. UI (`DealDetail.tsx` TasksTab и `/tasks`)
    — клик по чекбоксу ОТКРЫТОЙ задачи не переключает её сразу, а разворачивает инлайн-textarea
    с обязательным текстом результата (кнопка «Завершить» задизейблена без текста); закрытая задача
    показывает «Результат: …» под названием. При наличии `dealId` пишется `Activity{type:
    'task_completed', payload:{title, result}}` — видно на вкладке «Активность» карточки сделки.
    Контактная страница (`contacts/[id]`) — то же отображение результата, но read-only (там нет
    интерактивного тоггла задач вообще, не только для этой фичи).
    **Правку результата уже выполненной задачи** сделали через ПЕРЕИСПОЛЬЗОВАНИЕ существующей
    формы редактирования (кнопка-карандаш, `startEdit`/`handleSave`) — для `task.completed`
    в ней дополнительно рендерится textarea с результатом, сохраняется тем же `PATCH`, что и
    title/dueDate/assigneeId, БЕЗ поля `completed` в теле — поэтому гейт `result_required`
    (который смотрит именно на переход `completed: true` в запросе) не мешает более поздней
    правке текста. Отдельного UI/роута для «редактировать результат» не заводили.

83. **Автоматизации молча не срабатывали — `REDIS_URL` не был задан в окружении api**
    (июль 2026): триггер отработал (сделка перешла в этап), но действие
    (`change_field`) не выполнилось, никакой ошибки нигде не было видно — классическое проявление
    замечания 7/33 (`triggerAutomation()` вызывается fire-and-forget с `.catch(console.error)`,
    ошибка уходит только в лог api, HTTP-ответ на сам перенос этапа успешен). Причина — пустой
    `REDIS_URL`: `getRedisConnection()` в `engine.ts` тихо падает на дефолт `redis://localhost:6379`,
    которого в контейнере нет. По HTTP-ответу этого не видно вообще. **Ловушка на будущее**: при
    «ничего не произошло» после действия, которое должно было запустить BullMQ-очередь
    (автоматизации, напоминания, отложенные сообщения) первым делом проверять `REDIS_URL` в
    окружении api (`docker compose exec api printenv REDIS_URL`) и `docker compose logs api`, а не
    логику самой фичи.
84. **Триггер `webhook` переименован + получил фильтр по каналу; добавлено действие
    `send_http_request`** (июль 2026): жалоба была на непонятное название «Входящий webhook» —
    на деле `triggerAutomation({type:'webhook'})` вызывается ровно в одном месте
    (`webhooks/wazzup.ts`, любое входящее WazzUp-сообщение, сматченное со сделкой), никакой
    неоднозначности «на какой из вебхуков сработает» не было, просто плохой лейбл. Переименован в
    «Входящее сообщение WazzUp» (label в `AutomationDialog.tsx`/`settings/automations/page.tsx`,
    сам `type: 'webhook'` в схеме/БД не трогали — только отображение). Заодно добавлен опциональный
    `TriggerConfig.transport` — какой именно канал (whatsapp/telegram/sms/...) должен прийти, пусто
    = любой; `wazzup.ts` теперь прокидывает уже резолвленный `channel` в событие
    (`transport: channel`), `matchesTrigger()` в `engine.ts` сверяет его с `trigger.transport`
    только для `type === 'webhook'`.
    Новое действие `send_http_request` (URL + метод + кастомные заголовки + JSON-тело) — исходящий
    HTTP-запрос с плейсхолдерами `{dealId} {название} {сумма} {имя} {телефон} {email}` (те же
    фигурные скобки, что `renderInvoiceTemplate`, но на бэкенде — `buildPlaceholderVars()` +
    `renderPlaceholders()` в `engine.ts`, контакт подтягивается лениво только если у сделки есть
    `contactId`). Использует нативный `fetch` (Node 20) — новой зависимости не потребовалось.
    **Fire-and-forget, как и остальные actions**: ошибка/не-2xx только в `console.error`, не бросает
    исключение — не прерывает остальные actions автоматизации и не гонит retry всего BullMQ-джоба
    (в отличие от, например, неудачной отправки WazzUp-сообщения, которая тоже не бросает). Заголовок
    `Content-Type: application/json` подставляется автоматически, если тело задано и заголовок не
    переопределён вручную. `actionSchema`/`triggerSchema` в `routes/automations.ts` — обычные
    `z.object()` без `.strict()`, поэтому НЕ добавить новые поля в схему = Zod тихо срежет их при
    сохранении (`strip`-режим по умолчанию) — учтено сразу для `httpUrl/httpMethod/httpHeaders/httpBody`
    и `transport` триггера.
85. **Счётчик на вкладке «Задачи» в карточке сделки считает только невыполненные** (июль 2026):
    `DealDetail.tsx` вкладка `tasks` показывала `deal.tasks?.length` (все задачи, включая
    завершённые) — теперь `deal.tasks?.filter(t => !t.completed).length`. Список задач на самой
    вкладке по-прежнему показывает все (с результатом у завершённых, замечание 82) — поменялось
    только число в бейдже таба, чтобы оно отражало актуальную нагрузку, а не историю.

86. **Подготовка к масштабу 100k сделок / 150k контактов / 50 менеджеров — закрыты 4 узких места
    из замечания 69** (июль 2026): при просьбе оценить стек на 10× данных (было 10k сделок) вывод —
    сам стек (Postgres/Redis/Node) с запасом, узкие места точечные в коде + размер VPS (2vCPU/4GB
    мал, нужно 4vCPU/8–16GB и вынести Postgres). Реализовано:
    - **Канбан — лимит на колонку** (`routes/deals.ts` `GET /kanban/:pipelineId`, `KANBAN_DEALS_PER_STAGE=100`):
      грузит только 100 свежих карточек/этап + реальный `totalDeals` через фильтрованный `_count`;
      раньше грузил ВСЕ сделки воронки и рендерил их в DOM (@dnd-kit) — этап с тысячами сделок вешал
      и запрос, и браузер. Overflow → футер-ссылка `Ещё N → в списке` на `/deals?pipelineId=&stageId=`.
      Фронт: `KanbanColumn` показывает `totalDeals` в шапке + ссылку; `KanbanBoard` держит `totalDeals`
      в `localColumns` и корректирует его в сокет-хендлерах (moved/created/deleted) и локальном create,
      чтобы не было «показано 101 из 100». **Список `/deals` доработан под overflow**: читает
      `pipelineId`/`stageId` из `useSearchParams` (раньше игнорировал — ссылка вела бы в нефильтрованный
      список), «Показать ещё» ростом `limit` до серверного cap 200 (`parsePagination`), дальше —
      подсказка «уточните поиск/фильтр» (плоский список за 200 строк — не рабочий сценарий, ищут/
      фильтруют). ponytail-потолок: per-column infinite scroll с drag за пределами свежих 100 — если
      реально понадобится.
    - **Экспорт стримингом** (`routes/deals.ts` `GET /export`, `services/export/deals.ts`): раньше
      `findMany` ВСЕХ сделок в память + сборка всего CSV-стринга / всего `ExcelJS.Workbook` в памяти —
      на 100k строк гарантированный OOM на 4GB (особенно xlsx). Теперь курсор-батчи по 500
      (`orderBy: [{createdAt:desc},{id:desc}]`, `cursor: {id}`, `skip: 1`) + потоковый вывод: CSV
      через `csv-stringify` (НЕ `/sync`) с уважением backpressure (ждём `drain`, если буфер полон),
      XLSX через `ExcelJS.stream.xlsx.WorkbookWriter({stream: res, useStyles: false})` +
      `addRow(...).commit()`. Билдер разбит: `buildExportColumns()` (колонки из схемы полей, раз) +
      построчный `buildDealExportRow()` (был монолитный `buildDealExportRows`). Роут получил
      `try/catch`: до начала стрима — `next(err)` (обычный 500), после (заголовки ушли) — `res.destroy()`,
      т.к. корректно ответить уже нельзя.
    - **Кэш аналитики в Redis** (`routes/analytics.ts` + хелперы в `lib/redis.ts`): `GET /pipeline/:id`
      кэшируется 5 мин по ключу `analytics:pipeline:{id}:{from}:{to}` (агрегации по 100k сделок дорогие,
      точность до минуты не нужна; инвалидации нет — просрочка ≤5 мин заявлена в архитектуре). **Ключевое**:
      `cacheGet` НЕ делает голый `await redis.get` — под `maxRetriesPerRequest:null` недоступный Redis
      подвесил бы запрос навсегда (тот же класс, что замечание 33), поэтому гонка с 200мс таймаутом →
      `null` → просто считаем заново. `cacheSet` — fire-and-forget. Хелперы переиспользуемы для будущего
      кэширования.
    - **Чаты — ограничен скан** (`routes/chats.ts` `GET /`): `take: limit` на оба `distinct`-запроса
      (matched по `contactId`, unmatched по `chatId`) — раньше сканировали всю таблицу `Message` перед
      слайсом; теперь берут только `limit` свежих чатов (пагинация limit-grow, как в `email.ts`).
    - **Сознательно отложено** (0 пользы текущим запросам, постоянная цена на запись — решение
      пользователя): GIN-индекс на `custom_fields` (ни один WHERE не фильтрует по кастомным полям;
      utm-аналитика через `->>` в GROUP BY, GIN там не помогает — триггер добавления см. замечание 5)
      и нормализованная колонка телефона для дедупа (admin-only разовый прогон переживает 150k —
      `ponytail:` в `services/dedup/contacts.ts` фиксирует upgrade-path).

87. **Тюнинг воркеров BullMQ под idle-поллинг** (июль 2026): три воркера
    (`automations`/`scheduled-messages`/`trial-reminders`) на дефолтах BullMQ (`drainDelay` 5с —
    блокирующий опрос при простое; `stalledInterval` 30с) держат Redis под постоянной нагрузкой
    вхолостую, даже когда очереди пусты. Общий `workerTuning` в `lib/redis.ts` (`drainDelay: 60`,
    `stalledInterval: 300_000`) применён к трём `new Worker(..., { connection, ...workerTuning })`;
    sweep `trial-reminders` — 15 мин. `drainDelay` 60с безопасен: воркер всё равно просыпается
    мгновенно по маркеру нового джоба, реже опрашивает лишь на простое. `stalledInterval` 5 мин —
    медленнее ловит упавшие джобы, приемлемо.
    **Ловушка `rediss://`**: TLS у `ioredis` (`lib/redis.ts`) и у `getRedisConnection()` воркеров
    включается ТОЛЬКО по схеме `rediss://` (двойная `s`) — `getRedisConnection` ставит `tls:{}` по
    `u.protocol === 'rediss:'`. Если когда-нибудь `REDIS_URL` будет указывать на внешний Redis с
    обязательным TLS, схему в env надо писать `rediss://`, иначе соединение молча не поднимется.
    Свой Redis в контейнере (`docker-compose.yml`) ходит по обычному `redis://` внутри докер-сети.

88. **Сырые тела WazzUp в логах — только по флагу `LOG_WAZZUP_BODY=true`; `GET /api/subscriptions`
    скоуплен через `canViewContact`** (сентябрь 2026, по итогам security-ревью перед публикацией
    репозитория): диагностические логи из замечаний 44/49/50 (тело входящего вебхука, payload/ответ
    `sendMessage`, сырой `messageStatus` с ошибкой) писали в лог телефоны и тексты переписки
    клиентов на каждый запрос — теперь по умолчанию выключены, для `messageStatus` с ошибкой без флага
    остаётся строка `messageId + status`; `sendMessage error` не трогали (тело ошибки WazzUp, не
    переписка). `GET /subscriptions?contactId|dealId` раньше отдавал абонементы любого контакта
    любому залогиненному — теперь та же видимость, что у «Чатов» (`data.viewAll` или ответственный
    хотя бы по одной сделке контакта, контакт без сделок виден всем); при запросе по `dealId`
    проверяется контакт сделки. При 403 `SubscriptionCard` просто показывает пустой список.
    **Не закрыто этим заходом**: `GET /payments`, `GET /deals/:id` и сокет-комнаты `join:deal`/
    `join:pipeline` по-прежнему без owner-scoping — это общая задача IDOR для роли manager
    (замечание 73), а не точечный фикс.

## Git-процесс

GitHub — источник для автодеплоя (`.github/workflows/deploy.yml`).

### Стратегия веток

`main` — всегда рабочий код, можно деплоить. Прямые коммиты в `main` не делать — только через ветки.

Каждая фича/задача — отдельная ветка от `main`, живёт 1-3 дня:

| Тип | Пример |
|-----|--------|
| Новая фича | `feat/deal-modal` |
| Баг-фикс | `fix/wazzup-webhook` |
| Рефакторинг | `refactor/auth-middleware` |
| Хотфикс | `hotfix/jwt-expiry` |

### Рабочий цикл

```bash
# Начать задачу
git checkout main && git pull
git checkout -b feat/feature-name

# Коммитить по ходу работы
git add <files>
git commit -m "описание изменения"

# Завершить — смёрджить в main
git checkout main
git merge feat/feature-name
git push
git branch -d feat/feature-name
```

### Правила коммитов

- Коммитить только когда явно попросил пользователь
- Сообщение: коротко описывает суть изменения (не "fix", не "update")

### Обязательно перед push/merge в main

Перед тем как запушить или смёрджить ветку в `main`, зафиксировать ключевые изменения сессии
в документации — в `CLAUDE.md` (или в другом `.md`-файле, с которым велась работа, например
`docs/ROADMAP.md`):
- новые архитектурные решения, договорённости, ловушки — в соответствующий раздел `CLAUDE.md`
  (по аналогии с нумерованным списком «Важные замечания для разработки»)
- статус фич в `docs/ROADMAP-full.md` — отметить готовое, добавить новые пункты в бэклог
- если это не разовая правка, а значимая причина/контекст задачи — можно также сохранить в
  memory (project-тип) через обычный механизм памяти
Не пропускать этот шаг даже для небольших фиксов, если по ходу работы всплыло что-то неочевидное,
что стоит запомнить на будущее.

---

## Деплой

**Развёрнутого прода сейчас нет** (август 2026): Render-контур выведен, VPS ещё не поднят. В
репозитории лежит всё для развёртывания в любой момент — `docker-compose.yml`, `nginx/`,
`.github/workflows/deploy.yml`, ранбук `docs/vps-migration.md`; ничего дополнительно готовить не
нужно, только сервер и `.env`.

Контуров ровно два:
- **локально** — `docker-compose.dev.yml` (только postgres+redis) + `npm run dev`; демо-режим там
  же через `npm run dev:demo`, см. `docs/demo-stand.md`. Отдельного демо-деплоя нет.
- **VPS** — `docker-compose.yml` (postgres, redis, api, web, nginx с TLS), автодеплой на push в
  `main`.

## Деплой на VPS (Timeweb Cloud)

Полный пошаговый ранбук (провижининг сервера, TLS, перенос БД, вебхуки) — `docs/vps-migration.md`.

### Инфраструктура

Один VPS (2 vCPU / 4 ГБ / 40 ГБ NVMe, Ubuntu 24.04), всё через `docker-compose.yml` (prod):
`postgres` (18-alpine), `redis` (7-alpine, с паролем), `api`, `web`, `nginx` (TLS + reverse proxy).
Managed БД/Redis не используются — оба поднимаются локально в compose.

Пользователь `deploy` — без прямого SSH-доступа (вход всегда `ssh root@ip` → `su - deploy`),
код тянется из GitHub через SSH deploy-key (read-only, отдельный от личных ключей).

### Переменные окружения

Обязательные для `docker-compose.yml`, которых нет в `.env.example`: `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD` — из них compose сам собирает
`DATABASE_URL`/`REDIS_URL`, руками их не задавать. **Пароли — только `openssl rand -hex`**, не
`-base64`: символы `/+=` ломают парсинг `postgresql://`/`redis://` URL (Prisma падает с
`P1013: invalid port number`, хотя причина не в порте). `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_WS_URL` — на реальный домен (WS — обязательно `https://`, иначе браузер режет
WebSocket с https-страницы как mixed content). `PRISMA_ENGINES_MIRROR` — опционально, см. ниже.

### Рабочий цикл деплоя

**Автодеплой через GitHub Actions** (`.github/workflows/deploy.yml`): любой push в `main`
(включая обычный мёрдж фичи-ветки → `git push`) сам подключается по SSH к VPS и выполняет
`git pull && docker compose build && docker compose up -d`. Ручной запуск без изменения кода —
вкладка **Actions** → **Deploy to VPS** → **Run workflow** (`workflow_dispatch`), пригодится
после правки `.env`/секретов на самом сервере, когда коммитить нечего.

Для входа GitHub → сервер используется **отдельный** SSH-ключ (не тот read-only deploy-key,
которым сервер тянет код из GitHub, — этот идёт в обратную сторону): публичная часть в
`~/.ssh/authorized_keys` юзера `deploy`, приватная — в GitHub Secrets репозитория
(`DEPLOY_HOST`, `DEPLOY_USER=deploy`, `DEPLOY_SSH_KEY`, опционально `DEPLOY_PORT`). Секреты
после сохранения GitHub'ом больше не показывает — только переcоздать заново, если ключ утерян.

Ручной деплой (если Actions недоступен или нужно отладить руками):
```bash
ssh root@<IP> && su - deploy
cd ~/crm && git pull origin main
docker compose build && docker compose up -d
docker compose logs -f api   # дождаться "API running..." и "No pending migrations"
```
Данные в volume `postgres_data`/`redis_data` при `build`/`up` не трогаются.

### Особенности сборки Docker-образов (монорепо + VPS)

- `apps/api/Dockerfile` и `apps/web/Dockerfile` собираются с контекстом = **корень репозитория**
  (`docker-compose.yml`: `context: .`), не `./apps/*` — это npm-workspace, оба приложения зависят
  от `packages/shared` и корневого `package-lock.json`, которых не видно из контекста подпапки.
- `npm ci --include=dev` — обязателен явно в обоих Dockerfile. Без флага npm может пропустить
  devDependencies (`typescript`, prisma CLI, `tailwindcss`) в зависимости от окружения сборки —
  поймали именно на VPS (`tsc: not found`), хотя без флага та же команда на другой машине отрабатывала.
- `node:20-alpine` не содержит OpenSSL — движок Prisma падает в рантайме. `RUN apk add --no-cache
  openssl` в обеих стадиях `apps/api/Dockerfile`.
- `binaries.prisma.sh` может быть недоступен с российских IP — `prisma generate` падает при сборке
  обрывом соединения. Обход — build arg `PRISMA_ENGINES_MIRROR` (пробрасывается из `.env`), рабочее
  зеркало: `https://registry.npmmirror.com/-/binary/prisma`.
- Docker Hub режет анонимные `pull` по лимиту на общих IP облачных провайдеров — на сервере
  настроено зеркало Timeweb (`registry-mirrors` в `/etc/docker/daemon.json`).
- npm может положить зависимость (например, `date-fns-tz`) не в общий `node_modules`, а в
  `apps/api/node_modules/<пакет>` — учтено отдельным копированием в runner-стадию.
- Next.js standalone-сервер биндится на `process.env.HOSTNAME`, а Docker сам выставляет эту
  переменную равной id контейнера — без `ENV HOSTNAME=0.0.0.0` в `apps/web/Dockerfile` веб слушал
  бы только внутренний IP контейнера, а не все интерфейсы.
- PostgreSQL 18 сменил конвенцию монтирования данных: volume теперь на `/var/lib/postgresql` (без
  `/data`) — со старым путём (актуальным для ≤17) контейнер не стартует.
- `api` в compose использует `env_file: .env` + явные вычисляемые (`DATABASE_URL`/`REDIS_URL`/
  `PORT`/`NODE_ENV`), а не ручное перечисление каждой переменной — иначе легко забыть новую
  переменную и получить падение при старте (так и было с `CORS_ORIGIN`).
- BullMQ/ioredis: передавать plain-объект `{ host, port, password }` вместо инстанса `Redis` — иначе
  конфликт типов между bundled ioredis в BullMQ и внешней зависимостью.
- `jwt.sign expiresIn` из env — кастить через `as unknown as SignOptions['expiresIn']`
  (брендированный тип `StringValue`).
- `apps/web/tsconfig.json` должен иметь `"baseUrl": "."` — иначе Next.js не резолвит алиас `@/*`.

### nginx

`/health` у API смонтирован в корне (`GET /health`), не под `/api/` — отдельный `location = /health`
в `nginx/nginx.conf` (иначе снаружи 404 от фронтенда, не от API). TLS терминирует nginx через
certbot-сертификаты в `nginx/certs/` (в `.gitignore` — приватный ключ туда не коммитить).

### Тестовые данные (seed)

Seed НЕ запускается автоматически при Docker-деплое —
`prisma/seed.ts` нужно гонять руками (`docker compose exec api npx tsx prisma/seed.ts`), и то только
если реально нужны демо-данные (`SEED_DEMO=true` + `SEED_DEMO_PASSWORD`); на проде не запускать.
- Никогда не использовать `--no-verify`, `--force` в main, `git reset --hard` без явного запроса
