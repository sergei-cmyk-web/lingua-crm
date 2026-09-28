# /migrate — Создать и применить миграцию Prisma

Используй когда изменил `apps/api/prisma/schema.prisma`.

```bash
cd apps/api
npx prisma migrate dev --name <описание_изменения>
npx prisma generate
```

Примеры имён: `add_custom_fields`, `add_automation_table`, `add_calls_table`

После миграции:
- Проверить что файл появился в `apps/api/prisma/migrations/`
- Убедиться что `npx prisma studio` показывает новые таблицы/колонки
- Если нужны индексы — добавить в миграцию вручную через `prisma migrate dev --create-only`, затем отредактировать SQL-файл

Для продакшн деплоя использовать: `npx prisma migrate deploy`
