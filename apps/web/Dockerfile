# Собирается с контекстом = корень репозитория (см. docker-compose.yml build.context),
# т.к. это npm-workspace и web зависит от packages/shared + корневого package-lock.json.
FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
# Демо-стенд — см. lib/demo/*, docs/demo-stand.md. Пустые по умолчанию —
# обычная прод-сборка их не задаёт, и DEMO_MODE остаётся выключен.
ARG NEXT_PUBLIC_DEMO_MODE
ARG NEXT_PUBLIC_DEMO_EMAIL
ARG NEXT_PUBLIC_DEMO_PASSWORD
# Кросс-ссылки между прод-контуром и демо-стендом (два отдельных деплоя, см. docs/demo-stand.md) —
# пустые по умолчанию, тогда кнопки "Демо режим"/"Выйти из демо" скрыты.
ARG NEXT_PUBLIC_DEMO_STAND_URL
ARG NEXT_PUBLIC_MAIN_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_DEMO_EMAIL=$NEXT_PUBLIC_DEMO_EMAIL
ENV NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD
ENV NEXT_PUBLIC_DEMO_STAND_URL=$NEXT_PUBLIC_DEMO_STAND_URL
ENV NEXT_PUBLIC_MAIN_APP_URL=$NEXT_PUBLIC_MAIN_APP_URL
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# --include=dev обязателен: без него npm может пропустить devDependencies
# (tsc, tailwind, autoprefixer) и сборка падает
RUN npm ci --include=dev
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN mkdir -p apps/web/public
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker сам проставляет HOSTNAME=<container id>; standalone-сервер Next.js биндится
# именно на process.env.HOSTNAME, поэтому без явного оверрайда он слушает только
# внутренний IP контейнера, а не все интерфейсы.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
