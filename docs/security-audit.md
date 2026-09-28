# Аудит безопасности LinguaCRM + Roadmap перехода на VPS

> **Обновление 2026-07-10**: повторная проверка всех находок против текущего кода. Из
> исправленного другой работой: `pipelines.ts`/`packages.ts` полностью защищены (A1/A2),
> Dockerfile build context (B3), пароль Redis в проде (B4). Реализована **Волна 0** —
> A1 (allowlist-схемы на PATCH `deals/contacts/companies/tasks/automations/fields`), A2
> (`requireRole('admin','manager')` на `subscriptions`/`payments`), A6 (вебхуки `wazzup`/`uis`
> теперь fail-closed по умолчанию — новый флаг `ALLOW_UNVERIFIED_WEBHOOKS` вместо завязки на
> `NODE_ENV`), A9 (dummy-hash против тайминга на `/auth/login`), A11 (пиннинг `algorithms:
> ['HS256']` в `jwt.verify`). Всё проверено вручную curl-запросами с токенами разных ролей —
> см. секции ниже, отмечены `[РЕШЕНО 2026-07-10]`.
>
> **Обновление 2026-07-13**: Волна 3 частично закрыта — A5 (авторизация сокет-комнат `join:chat`/
> `join:email`/`join:chats-inbox`), A7 (глобальный rate limit на `/api`), A8 (honeypot на лид-форму,
> без полноценной CAPTCHA), A13 (anti-replay WazzUp-вебхука через дедуп по `messageId`), A14
> (zod-валидация JSON-настроек `lead_form`/`payments`) — см. `[РЕШЕНО 2026-07-13]` в секциях ниже.
> Остальные находки (A3-A4, A10, A12, инфраструктурные B1/B2/B5-B8) по-прежнему актуальны, отложены
> сознательно.

## Context

CRM (Next.js + Express + PostgreSQL + Redis) под онлайн-школу иностранных языков, 10–50 менеджеров,
до 10 000 сделок, хранит ПДн учеников (имена, телефоны, email, переписка), платёжные данные и историю
оплат. Разворачивается на собственном **VPS в РФ** (РФ обязателен из-за 152-ФЗ о персональных
данных) через Docker Compose. Администрировать сервер будет владелец
самостоятельно, опыта немного — поэтому упор на **автоматизацию** (авто-обновления, авто-бэкапы,
авто-продление сертификатов) и на понятный чек-лист.

Проведён полный аудит кода (auth/RBAC/сессии, вебхуки/публичные эндпоинты/платежи/валидация/инъекции) и
инфраструктуры (Docker, nginx, секреты, зависимости). Все находки проверены по коду с точными `file:line`.
**Этот документ — отчёт и приоритизированный roadmap, а не реализация.** Правки в код не вносились.

Важный контекст для приоритизации: это внутренний инструмент, все пользователи — сотрудники школы
(`admin` / `manager` / `teacher`). Поэтому «горизонтальный» IDOR между менеджерами — это риск инсайдера,
а вот **эскалация привилегий низкоправного `teacher`** (обход admin-only через mass-assignment и
незащищённые финансовые роуты) опаснее и чинится быстро — она в топе приоритетов.

---

## Часть A. Уязвимости в коде (по severity)

### Критично / Высокий приоритет

**A1. Mass-assignment на всех PATCH-роутах — `data: req.body` без схемы. [РЕШЕНО 2026-07-10]**
Затронуто: [deals.ts:126-152](apps/api/src/routes/deals.ts#L126-L152) (`data: req.body`, нет `validate`,
нет `requireRole`), а также `contacts.ts`, `companies.ts`, `tasks.ts`, `automations.ts`, `fields.ts`,
`pipelines.ts` (их POST-сиблинги валидируются, PATCH — нет).
- Обход admin-only soft-delete: `PATCH /api/deals/:id {"deletedAt":"..."}` — при том что `DELETE /:id`
  требует admin ([deals.ts:236](apps/api/src/routes/deals.ts#L236)).
- Обход валидации этапов: прямая запись `stageId`/`pipelineId`/`closedAt`/`lostReasonId` мимо всей логики
  причин потери и обязательных полей в [deals.ts:154-233](apps/api/src/routes/deals.ts#L154-L233).
- Prisma принимает **вложенные relation-writes**: тело вида `{"activities":{"deleteMany":{}}}` или
  `{"contact":{"update":{...}}}` мутирует связанные строки.
- **Фикс:** для каждого PATCH — `zod`-схема со `.strict()` (только скалярные поля-allowlist),
  прогонять через существующий `validate()` из [middleware/validate.ts](apps/api/src/middleware/validate.ts).
  Изменения этапа/удаления держать только в спец-роутах (`/:id/stage`, `DELETE`).

**A2. Финансовые роуты без ролевой проверки. [РЕШЕНО 2026-07-10]**
[subscriptions.ts:16](apps/api/src/routes/subscriptions.ts#L16) и `payments.ts` навешивают только
`authMiddleware`. Любой аутентифицированный (включая `teacher`) может создавать абонементы, **вручную
менять баланс уроков** (`PATCH /:id {"lessonsTotal":999}`), списывать/финализировать уроки, выставлять и
отменять счета.
- **Фикс:** решить матрицу ролей (кто вправе трогать деньги — вероятно `admin`+`manager`, но не `teacher`),
  навесить `requireRole(...)` на мутациях subscriptions/payments/packages по аналогии с уже защищёнными
  `trash`/`fields`/`automations`.

**A3. Нет отзыва/ротации токенов; роль берётся из payload токена, а не из БД.**
[auth.ts:47-64](apps/api/src/routes/auth.ts#L47-L64): `/refresh` перевыпускает access-токен, копируя `role`
из payload refresh-токена, не перечитывая пользователя. Refresh не ротируется, чёрного списка/`jti`/таблицы
сессий нет. Пользователь, разжалованный admin→manager или удалённый, сохраняет привилегии до **30 дней**;
украденный токен нельзя инвалидировать; logout — только очистка localStorage
([auth.store.ts](apps/web/src/store/auth.store.ts)).
- **Фикс:** хранить `jti` активных refresh в Redis (allowlist или blacklist), ротировать refresh при каждом
  использовании, при refresh **перечитывать роль из БД**, добавить серверный logout (удаление `jti`).
  Смена `JWT_SECRET` остаётся аварийным «разлогинить всех».

**A4. Access + refresh JWT в localStorage → XSS = долгоживущий захват аккаунта.**
[auth.store.ts:29-33](apps/web/src/store/auth.store.ts#L29-L33),
[lib/api/client.ts](apps/web/src/lib/api/client.ts), [lib/socket.ts:11](apps/web/src/lib/socket.ts#L11).
Любой stored-XSS выносит 30-дневный refresh; вместе с A3 (нет отзыва) — устойчивый доступ.
- **Фикс:** перенести токены в httpOnly+Secure+SameSite cookie (refresh точно; access можно в память).
  Требует правок и на бэке (Set-Cookie, CSRF-защита для мутаций), и на фронте. Смягчение до перехода — CSP
  (см. B/nginx).

### Средний приоритет

**A5. Socket.io: комнаты без авторизации. [РЕШЕНО 2026-07-13]**
[socket/handlers.ts:22-38](apps/api/src/socket/handlers.ts#L22-L38): соединение аутентифицируется (хорошо),
но `join:pipeline`/`join:deal` делают `socket.join()` по произвольному id без проверки прав — можно
подписаться на живой чат/события чужой сделки. **Фикс:** проверять доступ к сущности перед `join`.
**Реализовано частично, осознанно**: `join:chat` теперь проверяет `canViewContact()` (та же проверка,
что и `GET /api/chats/:contactId`) — это единственная комната, где REST УЖЕ ограничивает видимость
по пользователю (менеджер видит только чаты своих сделок). `join:email`/`join:chats-inbox` получили
гейт по `section.email`/`section.chats`, зеркалящий `router.use(requirePermission(...))` тех же роутов.
`join:pipeline`/`join:deal` оставлены БЕЗ проверки — намеренно: `GET /deals/:id` и весь REST-доступ к
сделкам/воронкам сейчас плоский (любой залогиненный видит любую сделку, см. IDOR-заметку в Волне 3
ниже), так что скоуп на сокет-комнату при полностью открытом REST дал бы только рассинхрон (сделка
видна в API, но не обновляется в реальном времени). Если/когда будет решён owner-scoping для `manager`,
`join:deal`/`join:pipeline` нужно будет прогнать через тот же паттерн.

**A6. WazzUp-вебхук пропускает всё при пустом секрете + завязка на точную строку `NODE_ENV`. [РЕШЕНО 2026-07-10]**
[webhooks/wazzup.ts:9-14](apps/api/src/routes/webhooks/wazzup.ts#L9-L14): при незаданном
`WAZZUP_WEBHOOK_SECRET` и `NODE_ENV !== 'production'` (пусто/`prod`/`staging`) подпись не проверяется —
`return true`. Платёжные провайдеры, наоборот, fail-closed. **Фикс:** fail-closed по умолчанию; не завязывать
на литерал `NODE_ENV`, а на явный флаг «secret обязателен».

**A7. Широко отсутствует rate limiting. [РЕШЕНО 2026-07-13]**
Лимиты только на `/auth/login`, `/auth/refresh` ([auth.ts:14-20](apps/api/src/routes/auth.ts#L14-L20)) и
`/api/leads`. Весь остальной CRUD, `/auth/me`, `/auth/users`, аналитика — без throttling. Усиливает риск
скрейпинга (в связке с плоским доступом). **Фикс:** глобальный лимитер на `/api` + отдельный на дорогие
эндпоинты; частично закрывается на уровне nginx (см. B).
**Реализовано**: `app.use('/api', apiLimiter)` в [index.ts](apps/api/src/index.ts) — 600 запросов/мин с
одного IP (запас под офисный NAT на 10-50 менеджеров), `/api/webhooks/*` исключены (`skip`) — провайдеры
аутентифицируются подписью/токеном, а не этим лимитером, и могут легитимно слать пачками. Существующие
частные лимитеры (`/auth/login`, `/auth/refresh`, `/api/leads`) не трогали — они строже и остаются в силе.

**A8. Публичная лид-форма: `form_key` не секрет → спам лидов. [РЕШЕНО частично 2026-07-13]**
[public/leads.ts](apps/api/src/routes/public/leads.ts): ключ вшит в клиентский JS лендинга, `cors({origin:true})`,
лимит только по IP (30/мин). Бот с ротацией IP массово плодит Contact+Deal+Activity и триггерит автоответы.
**Фикс:** CAPTCHA/hCaptcha или proof-of-work, ужесточить лимиты, опц. honeypot-поле.
**Реализовано**: honeypot-поле `website` в `leadSchema` — скрытое в HTML-форме лендинга поле, реальный
пользователь его не видит/не заполняет; заполненное — тихий `201 {ok:true}` без создания
Contact/Deal (не выдаём боту, что его отфильтровали). `ponytail:` в коде — honeypot не держит
целевого/headless-бота, читающего разметку страницы; если спам продолжится и после этого, следующий шаг —
hCaptcha/Cloudflare Turnstile (нужен внешний сервис + site key, не заводили без явного запроса). Лимиты
по IP не ужесточали — 30/мин уже стоит, ротация IP им и так не задерживается.

**A9. Login: user-enumeration по таймингу. [РЕШЕНО 2026-07-10]**
[auth.ts:31-34](apps/api/src/routes/auth.ts#L31-L34): при несуществующем email `bcrypt.compare` не
вызывается → ответ заметно быстрее. **Фикс:** всегда сравнивать с dummy-хешем.

### Низкий приоритет / informational

- **A10.** Несекретные integration-настройки (`targetsms_login`, `robokassa_login`, `cloudpayments_public_id`)
  читает любой аутентифицированный ([integrations.ts](apps/api/src/routes/integrations.ts)). Секреты
  write-only — сделано верно. **Фикс:** отдавать эти ключи только admin.
- **A11. [РЕШЕНО 2026-07-10]** `jwt.verify` без пиннинга алгоритма ([middleware/auth.ts:16](apps/api/src/middleware/auth.ts#L16)).
  Не эксплуатируется (jsonwebtoken v9 отклоняет `alg:none`), но добавить `{ algorithms: ['HS256'] }`.
- **A12.** Слабая парольная политика (min 6), **нет** эндпоинтов reset/forgot/change-password — пароль меняется
  только через БД. **Фикс:** change-password (в личном кабинете) + политика сложности.
- **A13. [РЕШЕНО 2026-07-13]** Вебхуки без anti-replay (timestamp/nonce). Платежи идемпотентны (безопасно),
  но подписанный WazzUp-`message` можно переиграть — повторно летят `triggerAutomation`/`NEW_MESSAGE`.
  **Фикс:** окно по timestamp + дедуп по id события.
  **Реализовано** без отдельной timestamp-инфраструктуры: `messageId` от WazzUp УЖЕ является id события
  и УЖЕ уникален в БД (`Message.wazzupId @unique`) — `handleMessageEntry()` в
  [webhooks/wazzup.ts](apps/api/src/routes/webhooks/wazzup.ts) теперь сначала проверяет, есть ли уже
  сообщение с этим `wazzupId`, и если да — выходит до эмита `NEW_MESSAGE`/вызова `triggerAutomation`
  (раньше `upsert` делал это идемпотентным для самой строки `Message`, но не для сайд-эффектов). Дедуп по
  id события — то же самое, что предлагал фикс, просто без отдельного окна по времени, т.к. у события уже
  есть надёжный уникальный id. `handleStatusEntry` (статусы доставки) не трогали — повторный `update` там
  идемпотентен по значению, побочных эффектов кроме повторного сокет-эмита нет.
- **A14. [РЕШЕНО 2026-07-13]** JSON-настройки (`lead_form`, `payments`) сохраняются без валидации формы →
  возможен неперехваченный `JSON.parse` → 500 ([leads.ts:57](apps/api/src/routes/public/leads.ts#L57)).
  Admin-only, низкий импакт.
  **Реализовано**: `PUT /api/integrations/settings/:key` в [integrations.ts](apps/api/src/routes/integrations.ts)
  валидирует JSON-форму для `lead_form`/`payments` zod-схемой (`.strict()`) до записи в БД — невалидный
  JSON или незнакомое поле теперь `400` в момент сохранения настройки, а не молчаливое сохранение мусора,
  который потом ловит (или не ловит) каждый читатель по отдельности. `leads.ts:57` физически как читал
  `JSON.parse` без try/catch, так и читает — но раз запись теперь гарантированно валидна, там больше
  нечему бросить исключение; отдельный try/catch туда не добавляли (был бы защитным кодом от
  недостижимого состояния).

### Проверено и сделано правильно (не трогать)
Раздельные секреты access/refresh; bcrypt cost 10; единый «Invalid credentials»; HMAC вебхуков **от сырого
тела** + `timingSafeEqual` с проверкой длины; идемпотентность платежей (`updateMany where status=pending` +
`@unique Subscription.paymentId`); **SQL-инъекций нет** (весь raw-SQL параметризован); нет SSRF (исходящие —
только на захардкоженные хосты); CORS fail-fast в проде; helmet; error-handler скрывает детали в проде;
`trust proxy`; секреты не в гите; seed opt-in. RBAC корректен на `pipelines`/`fields`/`automations`/
`packages`/`lost-reasons`/`trash`.

---

## Часть B. Инфраструктура для VPS

### Находки по текущим конфигам

**Высокий:**
- **B1.** `docker-compose.dev.yml` публикует Postgres `5432:5432` и Redis `6379:6379` на `0.0.0.0` с
  захардкоженными `crm_user`/`crm_password` и без пароля Redis. **На VPS использовать только
  `docker-compose.yml` (prod)**, где портов у БД/Redis нет.
- **B2.** Все контейнеры бегут от **root** — нет `USER` в Dockerfile'ах и `user:` в compose.
- **B3.** `apps/api/Dockerfile:4` — `COPY ../../package*.json ../../` выходит за пределы build-контекста
  (`./apps/api`); Docker это запрещает — **сборка образа падает как есть**. Починить до перехода на VPS.

**Средний:**
- **B4.** Redis без пароля даже в prod ([docker-compose.yml:37](docker-compose.yml#L37)) — держится только на
  сетевой изоляции. Задать `requirepass` и обновить `REDIS_URL`.
- **B5.** Нет resource limits (`mem_limit`/`pids_limit`), `cap_drop: ALL`, `security_opt: no-new-privileges`,
  read-only rootfs — нет контейнмента при компрометации/DoS.
- [РЕШЕНО 2026-07-13] **B6.** nginx: CSP, proxy-level `limit_req` (10r/s + burst 20 на `/api/`),
  `server_tokens off`, явный список ciphers (Mozilla intermediate) — добавлены в `nginx/nginx.conf`.
- [РЕШЕНО 2026-07-13] **B7.** Next.js `^14` → `^16.0.0` (React 18→19, recharts 2.12→2.15 и
  lucide-react 0.394→1.24 — оба требовали апгрейда ради React 19 peer-совместимости), axios поднят
  до фактически резолвящегося `1.18.1` (floor задекларирован `^1.8.2`). Express 4→5 — только план,
  см. `docs/ROADMAP-full.md` (раздел «План миграции на Express 5»), не выполнялся.
- [РЕШЕНО 2026-07-13] **B8.** `prisma` перемещён в `dependencies` (нужен в CMD для `migrate deploy`
  при старте контейнера), `apps/api/Dockerfile` делает `npm prune --omit=dev` перед копированием
  `node_modules` в runner-стадию — typescript/tsx/@types/* больше не едут в прод-образ.

**Низкий:** `.gitignore` не generic (перечисляет конкретные `.env*` — риск закоммитить `.env.vps`);
базовые образы не запиннены по digest; `morgan('dev')` в проде.

### Чего НЕТ в репозитории и нужно добавить для безопасного VPS
Firewall (ufw/nftables: только 22/80/443, deny 5432/6379 снаружи); fail2ban (SSH + nginx); автоматические
бэкапы Postgres (`pg_dump` по cron + off-site + проверка восстановления); certbot-сервис и авто-продление с
reload nginx; сегментация docker-сети (`internal: true` для postgres/redis); лимиты драйвера логов
(ротация); хардненинг SSH (ключи, без root-login, без паролей).

---

## Часть C. Приоритизированный Roadmap

### Волна 0 — быстрые фиксы кода ДО переезда (1–2 дня, высокий ROI)
Чинятся точечно, снимают самые дешёвые в эксплуатации дыры:
- A1 — strict-zod схемы на все PATCH (`data: req.body` → allowlist).
- A2 — `requireRole` на subscriptions/payments/packages.
- A6 — вебхуки fail-closed по умолчанию.
- A9 — dummy-хеш против тайминга; A11 — пиннинг алгоритма.
Верификация: `/verify` + ручные curl (teacher-токен → 403 на финансах; PATCH с `deletedAt` → отброшен).

### Волна 1 — базовый хардненинг VPS при переезде (полдня-день)
Выбор РФ-провайдера (Selectel / Timeweb / VK Cloud / Yandex Cloud — с учётом 152-ФЗ и доступности
Let's Encrypt). Затем **скрипт первичной настройки** (максимум автоматики):
- ОС: свежий Ubuntu LTS, `unattended-upgrades` (авто security-патчи), NTP.
- SSH: только ключи, `PermitRootLogin no`, `PasswordAuthentication no`, отдельный sudo-пользователь.
- `ufw`: allow 22/80/443, всё остальное deny; fail2ban (SSH + nginx-jails).
- Docker: только `docker-compose.yml` (prod), НЕ dev; починить `apps/api/Dockerfile:4` (B3);
  `USER node` + `user:` (B2); пароль Redis (B4); `internal: true` сеть для БД/Redis; resource limits +
  `no-new-privileges` + `cap_drop` (B5); лимиты лог-драйвера.
- TLS: certbot-контейнер + авто-продление + reload nginx; nginx — CSP, `server_tokens off`, `limit_req`,
  явные ciphers (B6).
- Бэкапы: cron `pg_dump` → gzip → off-site (S3-совместимое РФ-хранилище) + еженедельный тест-restore;
  задокументировать RPO/RTO.
- Секреты: `.env` вне гита (сделано), `.gitignore` → `.env*` + `!.env.example`; рассмотреть docker secrets.
Верификация: `nmap` снаружи (открыты только 22/80/443), SSL Labs / `testssl.sh` (A/A+), пробный
restore из бэкапа, проверка авто-продления сертификата (`--dry-run`).

### Волна 2 — хардненинг аутентификации (2–4 дня)
- A3 — ротация + отзыв refresh через Redis (`jti`), роль из БД при refresh, серверный logout.
- A4 — токены в httpOnly cookie + CSRF-защита мутаций.
- A12 — change-password + парольная политика; A10 — ограничить чтение integration-настроек до admin.
Верификация: демоут пользователя инвалидирует доступ ≤ времени жизни access; logout рвёт сессию;
XSS-PoC больше не достаёт refresh.

### Волна 3 — defense-in-depth и зрелость (по мере сил)
- [РЕШЕНО 2026-07-13] A5 — авторизация комнат Socket.io (`join:chat`/`join:email`/`join:chats-inbox`;
  `join:pipeline`/`join:deal` намеренно не скоупились — REST для сделок/воронок сейчас плоский, см. IDOR
  ниже); A7 — глобальный rate limit (600/мин/IP на `/api`, вебхуки исключены); A8 — honeypot на лид-форму
  (полноценная CAPTCHA не заводилась — нужен внешний сервис); A13 — anti-replay вебхука WazzUp (дедуп по
  `messageId`); A14 — zod-валидация JSON-настроек `lead_form`/`payments` на запись.
- [РЕШЕНО 2026-07-13] B6 — nginx CSP/limit_req/server_tokens off/ciphers; B7 — апгрейд Next.js → 16 +
  axios ≥ 1.8.2 (план Express 5, не выполнялся); B8 — `--omit=dev` в API-образе.
- Мониторинг/алерты (max автоматики для соло-админа): uptime-пинг `/health`, алерты по диску/памяти/
  падению контейнеров, авто-рестарт; централизованные логи.
- **IDOR / owner-scoping (A-архитектурное)**: сейчас плоская модель — любой сотрудник видит все данные.
  Для внутреннего инструмента это риск инсайдера; решить осознанно — вводить ли `assigneeId`-скоупинг для
  `manager` или оставить как есть с компенсацией через аудит-лог (`activities` уже есть). Крупная работа —
  планировать отдельно.

---

## Verification (как проверять на каждом шаге)
- **Код (Волна 0/2/3):** `/verify` для e2e-прогона затронутых флоу; ручные curl с токенами разных ролей
  (`teacher` → 403 на финансах и admin-мутациях; PATCH с запрещёнными полями → отброшен схемой);
  для auth — сценарий «демоут/удаление пользователя → доступ пропал».
- **Инфраструктура (Волна 1):** внешний `nmap` (открыты только 22/80/443; 5432/6379 недоступны);
  `testssl.sh`/SSL Labs (≥ A); `docker inspect` (контейнеры не root, лимиты применены); реальный
  тест-restore из свежего бэкапа; `certbot renew --dry-run`; проверка, что `docker-compose.dev.yml`
  на сервере не используется.
- **Зависимости:** после апгрейда — `npm audit` (уже на сервере/локально с сетью), сборка и smoke-тест.

## Файлы, которые будут затронуты при реализации (для справки)
Код: `apps/api/src/routes/{deals,contacts,companies,tasks,automations,fields,pipelines,subscriptions,payments,packages}.ts`,
`apps/api/src/routes/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/socket/handlers.ts`,
`apps/api/src/routes/webhooks/wazzup.ts`, `apps/api/src/routes/public/leads.ts`,
`apps/web/src/store/auth.store.ts`, `apps/web/src/lib/{api/client.ts,socket.ts}`.
Инфра: `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `nginx/nginx.conf`, `.gitignore`,
новые: скрипт провижининга VPS, certbot/бэкап-сервисы в compose, cron-задачи.
