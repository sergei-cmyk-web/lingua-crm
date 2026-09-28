# Собирается с контекстом = корень репозитория (см. docker-compose.yml build.context),
# т.к. это npm-workspace и api зависит от packages/shared + корневого package-lock.json.
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
# binaries.prisma.sh бывает недоступен с российских IP — тогда prisma generate падает
# на скачивании движков. Обход: PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
# в .env (пробрасывается через build args в docker-compose.yml). Пустое значение = дефолтный хост.
ARG PRISMA_ENGINES_MIRROR=
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# --include=dev обязателен: без него npm может пропустить devDependencies
# (tsc, prisma CLI) и сборка падает с "tsc: not found"
RUN npm ci --include=dev
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=packages/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api
RUN mkdir -p apps/api/node_modules
# prisma CLI остаётся (перемещён в dependencies — нужен в CMD рантайма для migrate deploy),
# devDependencies (typescript/tsx/@types/*) в runner-образ не идут
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
