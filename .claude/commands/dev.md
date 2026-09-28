# /dev — Запустить dev-окружение

Поднять все сервисы для локальной разработки:

1. Запустить инфраструктуру (postgres + redis):
   ```
   docker-compose -f docker-compose.dev.yml up -d postgres redis
   ```

2. Применить миграции:
   ```
   cd apps/api && npx prisma migrate dev
   ```

3. Запустить backend (порт 4000):
   ```
   cd apps/api && npm run dev
   ```

4. Запустить frontend (порт 3000):
   ```
   cd apps/web && npm run dev
   ```

5. Проверить что http://localhost:3000 открывается и авторизация работает.

Если порты заняты — найти процесс: `lsof -i :3000` или `lsof -i :4000` и завершить его.
