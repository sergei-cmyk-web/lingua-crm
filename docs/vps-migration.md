# Деплой CRM на VPS (Timeweb Cloud)

Продакшен — VPS, `docker-compose.yml`, без внешних managed-сервисов (Postgres/Redis — свои контейнеры).

## Минимальная конфигурация VPS

| Параметр | Значение |
|---|---|
| CPU / RAM | 2 vCPU / 4 ГБ |
| Диск | 40 ГБ NVMe |
| ОС | Ubuntu 24.04 LTS |
| Провайдер | Timeweb Cloud (РФ, 152-ФЗ) |

---

## Шаг 1. Подготовка сервера (под root)

```bash
ssh root@<IP>          # или веб-консоль Timeweb, если SSH не пускает (см. ниже)

apt update && apt upgrade -y
apt install -y unattended-upgrades fail2ban ufw curl git
dpkg-reconfigure -plow unattended-upgrades

# пользователь для работы — БЕЗ прямого SSH-доступа, только через su из-под root
adduser deploy
usermod -aG sudo deploy

# authorized_keys НЕ наследуется автоматически — без этого прямой `ssh deploy@IP`/`scp` с
# ноутбука упадёт Permission denied (publickey), хотя `ssh root@IP` работает
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# root — только по ключу, пароли отключены полностью
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sshd -t && systemctl restart ssh     # sshd -t ПЕРЕД рестартом — проверка синтаксиса

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban

curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Docker Hub режет анонимные pull по лимиту (частая беда с общих IP облачных
# провайдеров) — зеркало Timeweb снимает проблему сразу и для сборки, и для pull
cat <<'EOF' | tee /etc/docker/daemon.json
{ "registry-mirrors": ["https://dockerhub.timeweb.cloud"] }
EOF
systemctl restart docker
```

**Если `ssh root@<IP>` даёт «Connection refused»** — это не про сам сервер (проверяется через
`systemctl status ssh` и `ufw status verbose` в веб-консоли), а почти всегда про **отдельный
облачный firewall/security group в панели Timeweb** — раздел «Сеть»/«Файрвол» у конкретного
сервера, отдельный от `ufw` внутри ОС. Он режет и 80/443 точно так же (проявляется как таймаут
у certbot на шаге 4) — разрешить входящие 22/80/443 там же, до того как копаться внутри сервера.

Дальше весь деплой — всегда через:
```bash
ssh root@<IP>
su - deploy
```
(`su -` от root не спрашивает пароль; пароль deploy нужен только для `sudo` внутри его же сессии.)

---

## Шаг 2. Доступ к GitHub — SSH deploy key (под пользователем deploy)

GitHub не принимает обычный пароль аккаунта для `git clone` по HTTPS — только Personal Access Token,
либо (правильнее для сервера) SSH deploy-key с доступом только на чтение к одному репозиторию.

**Под `deploy`** (после `su - deploy`):
```bash
ssh-keygen -t ed25519 -C "crm-vps-deploy" -f ~/.ssh/crm_deploy_key -N ""
cat ~/.ssh/crm_deploy_key.pub
```
Скопировать вывод.

**На GitHub** (в браузере): репозиторий → Settings → **Deploy keys** → Add deploy key → вставить
публичный ключ → **не** включать "Allow write access" → Add key.

**Снова под `deploy`:**
```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/crm_deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

cd ~
git clone git@github.com:<your-account>/crm.git
ls -la ~/crm/docker-compose.yml    # проверка, что клонировалось туда, куда нужно
```

Ключ и `git clone` должны выполняться **именно под deploy**, не под root — если делать это в
сессии root ещё до `su - deploy`, репозиторий окажется в `/root/crm`, а deploy его не увидит.

---

## Шаг 3. `.env` на сервере

```bash
cd ~/crm
cp .env.example .env
nano .env
```

В `.env.example` нет части переменных, которые **обязательны** для `docker-compose.yml` — без них
контейнеры не поднимутся или API упадёт при старте (production fail-fast на `CORS_ORIGIN`). Дописать:

```env
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=crm_db
REDIS_PASSWORD=<openssl rand -hex 24>
CORS_ORIGIN=https://ваш-домен.ru
NEXT_PUBLIC_API_URL=https://ваш-домен.ru
NEXT_PUBLIC_WS_URL=https://ваш-домен.ru
WAZZUP_WEBHOOK_SECRET=<openssl rand -hex 16>
# Нужен только если binaries.prisma.sh недоступен из РФ (см. шаг 6) — можно
# добавить сразу или дописать позже, если сборка упадёт на "prisma generate"
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
```

Плюс скопировать в `.env` секреты приложения (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `WAZZUP_API_KEY`,
`UIS_*`, S3-креды, `SCHOOL_TZ`) — откуда угодно, где они у вас хранились раньше (менеджер паролей,
старый `.env`) — вписать те же значения, тогда все текущие сессии переживут переезд.

Нюансы:
- **Пароли — только `openssl rand -hex N`, НЕ `-base64`.** `-base64` может выдать `/`, `+`, `=` —
  эти символы, попав в `postgresql://user:ПАРОЛЬ@host:5432/db` или `redis://:ПАРОЛЬ@host:6379`,
  ломают парсинг URL (`/` рвёт строку в произвольном месте, парсер Prisma падает с
  `P1013: invalid port number`, хотя причина совсем не в порте). `hex` — только `0-9a-f`, безопасно
  всегда. Если пароль уже сгенерирован через base64 и Postgres уже проинициализирован с ним — не
  пересоздавать volume, а сменить пароль у живой роли:
  `docker compose exec postgres psql -U crm_user -d crm_db -c "ALTER USER crm_user PASSWORD 'новый-hex-пароль';"`
  и следом `docker compose up -d --force-recreate postgres api` (для Redis пересоздание контейнера
  подхватывает новый пароль само, ничего внутри менять не нужно).
- `DATABASE_URL` / `REDIS_URL` руками НЕ задавать — compose вычисляет их сам из `POSTGRES_*`
  и `REDIS_PASSWORD` и переопределяет всё, что написано в `.env`.
- `WAZZUP_CHANNEL_ID` — легаси-фолбэк, каналы приедут в БД вместе с дампом; оставить пустым.
- `WAZZUP_WEBHOOK_SECRET` — НЕ ищется в личном кабинете WazzUp: WazzUp вебхуки не подписывает,
  поля «секрет» у него нет. Секрет попадает к WazzUp в составе URL вебхука при регистрации (шаг 6).
- `NEXT_PUBLIC_WS_URL` — обязательно `https://` (с `http://` браузер режет WebSocket
  с https-страницы как mixed content — реалтайм не работает).
- `NODE_ENV=production` — на сборку не влияет (компилируется одинаково), но обязателен в рантайме:
  от него зависит, например, что вебхук WazzUp fail-closed отклоняет запросы без токена.
- Реальные значения секретов — только в `.env` на сервере, никогда в документации/git.

---

## Шаг 4. DNS + TLS

**DNS** (на стороне регистратора домена, не на сервере): A-запись `ваш-домен.ru` → IP сервера.
Проверить: `dig ваш-домен.ru +short`.

**На сервере:**
```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d ваш-домен.ru --agree-tos -m <ваш-email> --non-interactive

sudo mkdir -p ~/crm/nginx/certs
sudo cp /etc/letsencrypt/live/ваш-домен.ru/fullchain.pem ~/crm/nginx/certs/
sudo cp /etc/letsencrypt/live/ваш-домен.ru/privkey.pem ~/crm/nginx/certs/

echo '0 3 * * * root certbot renew --quiet --deploy-hook "docker compose -f /home/deploy/crm/docker-compose.yml restart nginx"' | sudo tee /etc/cron.d/certbot-renew
```

Certbot standalone занимает порт 80 — выполнять ДО `docker compose up` (иначе порт занят
nginx-контейнером). Если получаете `Timeout during connect (likely firewall problem)` — DNS уже
указывает правильно, но пакеты не доходят до сервера: см. про облачный firewall/security group
Timeweb в шаге 1, он режет 80/443 точно так же, как резал 22.

---

## Шаг 5. Перенос данных Postgres со старого хостинга

Если предыдущий хостинг использовал PostgreSQL другой мажорной версии — `pg_dump` не работает
с сервером **новее** себя (`docker-compose.yml` сейчас на `postgres:18-alpine`; если у вас на
исходном сервере, например, 16-я версия — дамп снять `postgres:16-alpine`, ошибка будет явной:
`aborting because of server version mismatch`, там же увидите нужную версию).

```bash
cd ~/crm

docker run --rm postgres:18-alpine \
  pg_dump -Fc "<connection-url-старой-базы>" \
  > crm_dump.gz

docker compose up -d --wait postgres   # --wait — дождаться healthy, иначе следующая
                                        # команда может упереться в ещё не поднявшийся сервер
docker compose exec -T postgres pg_restore -U crm_user -d crm_db --clean --if-exists < crm_dump.gz
```

`pg_restore` почти наверняка выдаст десятки строк вида
`ERROR: role "старый_user" does not exist / Command was: ALTER TABLE ... OWNER TO старый_user`
и в конце `warning: errors ignored on restore: N` — это **безвредно**: дамп пытается назначить
владельцем таблиц роль со старого сервера, которой здесь закономерно нет; сами данные (`COPY`)
это не затрагивает, restore проходит владельцем `crm_user`. Явных ошибок про `COPY`/данные быть
не должно. Проверка, что данные реально приехали:
```bash
docker compose exec -T postgres psql -U crm_user -d crm_db -c 'select count(*) from "Deal";'
docker compose exec -T postgres psql -U crm_user -d crm_db -c 'select count(*) from "User";'
```
(имена таблиц — CamelCase в кавычках, Prisma создаёт их именно так, не `deals`/`users`).

---

## Шаг 6. Поднять весь стек и проверить

```bash
cd ~/crm
docker compose build
docker compose up -d
docker compose logs -f api     # дождаться "API running on http://localhost:4000" и "No pending migrations"
```

Если сборка падает на `RUN npx prisma generate` с обрывом соединения до `binaries.prisma.sh`
(типично для российских IP) — добавить в `.env` (см. шаг 3) `PRISMA_ENGINES_MIRROR` и пересобрать:
`docker compose build api`.

Если падает на `sh: tsc: not found` при сборке `packages/shared` — значит `npm ci` не поставил
devDependencies; в `apps/api/Dockerfile`/`apps/web/Dockerfile` уже стоит `npm ci --include=dev`
именно из-за этого — если ошибка всё равно есть, значит на сервере старый код: `git pull origin main`
и пересобрать.

Проверка снаружи:
```bash
curl https://ваш-домен.ru/health          # {"status":"ok",...} — health API замаунтен в nginx
curl https://ваш-домен.ru/api/auth/me     # {"error":"Unauthorized"} = 401 — API жив, требует логин
curl -o /dev/null -w "%{http_code}\n" https://ваш-домен.ru/login   # 200 — фронт жив
```
`/api/health` (без разбора — просто по аналогии с остальными `/api/*`) вернёт `{"error":"Not
found"}` — это НЕ баг, health-роут в API смонтирован в корне (`GET /health`), а не под `/api/`;
nginx проксирует его отдельным `location = /health`.

Дальше — переключить webhook URL у внешних сервисов на новый домен:

**WazzUp** — вебхуки регистрируются не в кабинете, а через API; секрет передаётся прямо в URL
(`?token=`), потому что WazzUp не подписывает вебхуки и никакого поля «секрет» у него нет:

```bash
curl -X PATCH https://api.wazzup24.com/v3/webhooks \
  -H "Authorization: Bearer <WAZZUP_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhooksUri": "https://ваш-домен.ru/api/webhooks/wazzup?token=<WAZZUP_WEBHOOK_SECRET>",
    "subscriptions": { "messagesAndStatuses": true }
  }'
```

WazzUp сразу пришлёт тестовый POST `{test: true}` на этот URL и включит вебхуки только при
ответе 200 — то есть стек (шаг выше) должен уже работать. При смене секрета — перерегистрировать
URL этой же командой. Проверить текущее состояние: `GET https://api.wazzup24.com/v3/webhooks`
с тем же заголовком.

**UIS / CloudPayments / Робокасса** — URL меняются в личных кабинетах провайдеров
(`{домен}/api/webhooks/uis`, `{домен}/api/webhooks/payments/cloudpayments`,
`{домен}/api/webhooks/payments/robokassa`).

Смоук-тест: логин, канбан, входящее WhatsApp-сообщение (написать себе на подключённый номер —
проверяет вебхук end-to-end), тестовый платёж, отправка email.

---

## Шаг 7. Бэкапы

```bash
sudo mkdir -p /opt/backups
sudo tee /opt/backups/pg_backup.sh <<'EOF'
#!/bin/bash
cd /home/deploy/crm
docker compose exec -T postgres pg_dump -U crm_user -Fc crm_db > /opt/backups/crm_$(date +%F).dump
find /opt/backups -name "crm_*.dump" -mtime +14 -delete
EOF
sudo chmod +x /opt/backups/pg_backup.sh
echo '0 4 * * * root /opt/backups/pg_backup.sh' | sudo tee /etc/cron.d/pg-backup
```

Плюс — копия `/opt/backups` во внешнее S3-хранилище хотя бы раз в неделю, и один пробный `pg_restore`
из свежего дампа — бэкап, который ни разу не восстанавливали, бэкапом не считается.

---

## Обновление кода (обычный цикл после первого деплоя)

```bash
ssh root@<IP>
su - deploy
cd ~/crm
git pull origin main
docker compose build
docker compose up -d
docker compose logs -f api
```
Данные в volume `postgres_data`/`redis_data` при `build`/`up` не трогаются.

---

## Что было исправлено при первом переносе (справочно, для будущих правок Dockerfile/compose)

1. **Контекст сборки Docker** — `apps/api`/`apps/web` — npm-workspace, зависят от `packages/shared`
   и корневого `package-lock.json`. Оба Dockerfile собираются с контекстом = корень репозитория
   (`docker-compose.yml`: `context: .`, `dockerfile: apps/api/Dockerfile` / `apps/web/Dockerfile`).
2. **`npm ci --include=dev` обязателен в обоих Dockerfile** — без явного флага npm может пропустить
   devDependencies (typescript, prisma CLI, tailwind) в зависимости от окружения сборки, и тогда
   `tsc`/`next build` падают с «not found». Разово поймали именно на VPS, хотя на другой машине
   та же команда без флага отрабатывала нормально — не полагаться на дефолтное поведение `npm ci`.
3. **Prisma + Alpine** — `node:20-alpine` не содержит OpenSSL, движок Prisma падает в рантайме.
   `RUN apk add --no-cache openssl` в обеих стадиях `apps/api/Dockerfile`.
4. **`binaries.prisma.sh` может быть недоступен с российских IP** — `prisma generate` падает при
   сборке с обрывом соединения. Обход — `PRISMA_ENGINES_MIRROR` (build arg, пробрасывается из `.env`
   через `docker-compose.yml`), рабочее зеркало — `https://registry.npmmirror.com/-/binary/prisma`.
5. **Docker Hub — лимит анонимных pull** — общие IP облачных провайдеров легко упираются в лимит
   («You have reached your unauthenticated pull rate limit»). Зеркало Timeweb
   (`registry-mirrors` в `/etc/docker/daemon.json`, см. шаг 1) снимает проблему для всех образов.
6. **Nested workspace-зависимость** — npm может положить пакет (например, `date-fns-tz`) не в общий
   `node_modules`, а в `apps/api/node_modules/<пакет>` — в `apps/api/Dockerfile` это учтено отдельным
   копированием `apps/api/node_modules` в runner-стадию.
7. **Next.js standalone + Docker** — Docker сам выставляет `HOSTNAME=<id контейнера>` в каждом
   контейнере, а standalone-сервер Next биндится именно на `process.env.HOSTNAME` — без оверрайда
   веб слушал только внутренний IP контейнера, а не все интерфейсы. `ENV HOSTNAME=0.0.0.0` в
   `apps/web/Dockerfile`.
8. **`CORS_ORIGIN` и другие env-переменные** — `api` в `docker-compose.yml` использует
   `env_file: .env` + явные вычисляемые (`DATABASE_URL`/`REDIS_URL`/`PORT`/`NODE_ENV`), а не ручное
   перечисление каждой переменной — иначе легко забыть новую переменную и получить падение при
   старте (так и было с `CORS_ORIGIN` при первом заходе).
9. **Пароли Postgres/Redis — генерировать `openssl rand -hex`, не `-base64`** — спецсимволы `/+=`
   ломают парсинг connection URL (см. шаг 3).
10. **PostgreSQL 18 сменил конвенцию монтирования данных** — точка монтирования volume теперь
    `/var/lib/postgresql` (без `/data`); со старым путём (актуальным для ≤17) контейнер не стартует
    вообще, с сообщением про `pg_ctlcluster`.
11. **`docker compose up -d` без `--wait` — гонка перед `pg_restore`** — контейнер помечается
    `Started` сразу после запуска процесса, база в этот момент может ещё инициализироваться.
    `docker compose up -d --wait postgres` ждёт именно healthcheck, не просто старт процесса.
12. **WazzUp не подписывает вебхуки** — аутентификация вебхука через токен в URL
    (`?token=<WAZZUP_WEBHOOK_SECRET>`), не через несуществующий HMAC/`X-Wazzup-Signature`
    (см. CLAUDE.md, замечание 2).
13. **`/health` не проксировался nginx'ом** — API монтирует health-роут в корне (`GET /health`),
    а не под `/api/`; добавлен отдельный `location = /health` в `nginx/nginx.conf`.
14. **`nginx/certs/` не был в `.gitignore`** — риск закоммитить приватный ключ сертификата, если он
    когда-нибудь окажется в этой папке на машине, где `git add -A` выполняется не глядя.

Все правки проверены реальной сборкой и запуском полного стека (`docker compose build` + `up` +
curl `/health`, `/api/auth/me`, `/login`) локально, включая прогон всех Prisma-миграций на Postgres 18.
