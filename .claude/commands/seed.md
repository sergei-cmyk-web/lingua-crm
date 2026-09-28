# /seed — Заполнить БД тестовыми данными

Создать тестовые данные для разработки:

```bash
cd apps/api
npx ts-node prisma/seed.ts
```

Скрипт должен создать:
- 3 пользователя: admin@test.com, manager1@test.com, manager2@test.com (пароль: `test123`)
- 1 воронку "Продажи курсов" с 5 этапами: Новый лид → Квалификация → Коммерческое предложение → Переговоры → Успешно закрыта
- 5 кастомных полей для сделки: `student_level` (select), `course_type` (select), `lesson_count` (number), `trial_date` (date), `source` (text)
- 10 тестовых сделок с контактами
- 5 задач

Для сброса данных перед seed: `npx prisma migrate reset` (удаляет ВСЕ данные, только в dev!)
