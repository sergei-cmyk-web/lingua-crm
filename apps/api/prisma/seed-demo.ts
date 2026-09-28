import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Данные для демо-стенда (demo.example.com) — читаются с реального бэкенда только на чтение
// (см. apps/web/src/lib/demo/adapter.ts: мутации не долетают до сервера). Заметно богаче
// prisma/seed.ts (используемого для локальной разработки), т.к. это витрина для заказчиков/HR:
// нужны заполненные вкладки «Сообщения», «Пробные уроки», «Абонементы», won/lost-сделки и т.д.
// Использует ТЕ ЖЕ переменные окружения, что и build args фронтенда (NEXT_PUBLIC_DEMO_EMAIL/
// NEXT_PUBLIC_DEMO_PASSWORD, см. docker-compose.yml) — авто-логин демо-сборки должен попадать
// именно в этого пользователя.
async function main() {
  if (process.env.DEMO_MODE !== 'true') {
    console.log('seed-demo.ts предназначен только для demo-стенда — задайте DEMO_MODE=true, чтобы запустить намеренно.')
    return
  }

  console.log('Заполняем демо-стенд тестовыми данными...')

  // `||`, не `??`: пустая переменная в .env — это «не задано», иначе юзер создастся с пустым
  // email и авто-логин фронта (у него свой дефолт) упрётся в 401.
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL || 'demo@example.com'
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'demo12345'
  const passwordHash = await bcrypt.hash(demoPassword, 10)

  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash },
    create: { email: demoEmail, name: 'Демо-администратор', roleId: 'role_admin_system', passwordHash },
  })
  const manager1 = await prisma.user.upsert({
    where: { email: 'anna@example.com' },
    update: { passwordHash },
    create: { email: 'anna@example.com', name: 'Анна Иванова', roleId: 'role_manager_system', passwordHash },
  })
  const manager2 = await prisma.user.upsert({
    where: { email: 'petr@example.com' },
    update: { passwordHash },
    create: { email: 'petr@example.com', name: 'Пётр Сидоров', roleId: 'role_manager_system', passwordHash },
  })
  const teacher1 = await prisma.user.upsert({
    where: { email: 'teacher-en@example.com' },
    update: { passwordHash },
    create: { email: 'teacher-en@example.com', name: 'Мария Петрова (англ.)', roleId: 'role_teacher_system', passwordHash },
  })
  const teacher2 = await prisma.user.upsert({
    where: { email: 'teacher-de@example.com' },
    update: { passwordHash },
    create: { email: 'teacher-de@example.com', name: 'Джон Смит (нем.)', roleId: 'role_teacher_system', passwordHash },
  })
  const managers = [manager1, manager2, demoUser]

  // --- Воронка ---
  const pipeline = await prisma.pipeline.upsert({
    where: { id: 'demo-pipeline-main' },
    update: {},
    create: {
      id: 'demo-pipeline-main',
      name: 'Продажа курсов',
      stages: {
        create: [
          { name: 'Новый лид', color: '#94a3b8', order: 0, type: 'open' },
          { name: 'Квалификация', color: '#3b82f6', order: 1, type: 'open' },
          { name: 'Пробный урок', color: '#f59e0b', order: 2, type: 'open' },
          { name: 'Коммерческое предложение', color: '#8b5cf6', order: 3, type: 'open' },
          { name: 'Оплачено', color: '#22c55e', order: 4, type: 'won' },
          { name: 'Отказ', color: '#ef4444', order: 5, type: 'lost' },
        ],
      },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  })
  const [stageNew, stageQualify, stageTrial, stageOffer, stageWon, stageLost] = pipeline.stages

  // --- Причины потери ---
  const lostReasonNames = ['Дорого', 'Выбрали другую школу', 'Не дозвонились', 'Передумал учиться', 'Не подошло расписание']
  const lostReasons = []
  for (let i = 0; i < lostReasonNames.length; i++) {
    lostReasons.push(
      await prisma.lostReason.upsert({
        where: { id: `demo-lost-reason-${i}` },
        update: {},
        create: { id: `demo-lost-reason-${i}`, name: lostReasonNames[i], order: i },
      })
    )
  }

  // --- Кастомные поля ---
  const fieldDefs = [
    { entityType: 'deal', key: 'student_level', label: 'Уровень ученика', fieldType: 'select', order: 0, options: [{ value: 'A1', label: 'A1 — Начинающий' }, { value: 'A2', label: 'A2' }, { value: 'B1', label: 'B1 — Средний' }, { value: 'B2', label: 'B2' }, { value: 'C1', label: 'C1 — Продвинутый' }] },
    { entityType: 'deal', key: 'course_type', label: 'Тип курса', fieldType: 'select', order: 1, options: [{ value: 'individual', label: 'Индивидуальный' }, { value: 'group', label: 'Групповой' }, { value: 'intensive', label: 'Интенсив' }] },
    { entityType: 'deal', key: 'lesson_count', label: 'Количество уроков', fieldType: 'number', order: 2 },
    { entityType: 'deal', key: 'source', label: 'Источник лида', fieldType: 'select', order: 3, options: [{ value: 'instagram', label: 'Instagram' }, { value: 'vk', label: 'ВКонтакте' }, { value: 'avito', label: 'Avito' }, { value: 'referral', label: 'Сарафан' }, { value: 'site', label: 'Сайт' }] },
    { entityType: 'contact', key: 'age', label: 'Возраст', fieldType: 'number', order: 0 },
    { entityType: 'contact', key: 'city', label: 'Город', fieldType: 'text', order: 1 },
  ]
  for (const fd of fieldDefs) {
    const exists = await prisma.fieldDefinition.findFirst({ where: { entityType: fd.entityType, key: fd.key, pipelineId: null } })
    if (!exists) await prisma.fieldDefinition.create({ data: { ...fd, options: fd.options ?? null, pipelineId: null } })
  }

  // --- Пакеты уроков ---
  const packages = await Promise.all([
    prisma.package.create({ data: { name: '8 уроков (индивидуально)', lessonsCount: 8, lessonDurationMinutes: 60, durationDays: 60, price: 24000 } }),
    prisma.package.create({ data: { name: '16 уроков (индивидуально)', lessonsCount: 16, lessonDurationMinutes: 60, durationDays: 120, price: 44000 } }),
    prisma.package.create({ data: { name: '8 уроков (группа)', lessonsCount: 8, lessonDurationMinutes: 90, durationDays: 60, price: 12000 } }),
    prisma.package.create({ data: { name: 'Интенсив 30 уроков', lessonsCount: 30, lessonDurationMinutes: 60, durationDays: 45, price: 75000 } }),
  ])

  // --- Компании ---
  const companies = await Promise.all([
    prisma.company.create({ data: { name: 'ООО «ЛингвоПлюс»' } }),
    prisma.company.create({ data: { name: 'АйТи Консалтинг' } }),
  ])

  // --- Контакты ---
  const contactSeed = [
    { name: 'Мария Петрова', phone: '+79261112233', email: 'petrova.maria@example.com', city: 'Москва', age: 28 },
    { name: 'Иван Козлов', phone: '+79261112234', email: 'kozlov.ivan@example.com', city: 'Санкт-Петербург', age: 35 },
    { name: 'Ольга Смирнова', phone: '+79261112235', email: 'smirnova.o@example.com', city: 'Казань', age: 24 },
    { name: 'Дмитрий Волков', phone: '+79261112236', email: 'volkov.d@example.com', city: 'Москва', age: 41 },
    { name: 'Екатерина Соколова', phone: '+79261112237', email: 'sokolova.e@example.com', city: 'Новосибирск', age: 19 },
    { name: 'Алексей Морозов', phone: '+79261112238', email: 'morozov.a@example.com', city: 'Екатеринбург', age: 30 },
    { name: 'Наталья Лебедева', phone: '+79261112239', email: 'lebedeva.n@example.com', city: 'Москва', age: 27 },
    { name: 'Сергей Новиков', phone: '+79261112240', email: 'novikov.s@example.com', city: 'Краснодар', age: 33 },
    { name: 'Юлия Захарова', phone: '+79261112241', email: 'zaharova.y@example.com', city: 'Москва', age: 22 },
    { name: 'Андрей Соловьёв', phone: '+79261112242', email: 'solovyov.a@example.com', city: 'Пермь', age: 45 },
    { name: 'Виктория Кузнецова', phone: '+79261112243', email: 'kuznetsova.v@example.com', city: 'Ростов-на-Дону', age: 26 },
    { name: 'Максим Попов', phone: '+79261112244', email: 'popov.m@example.com', city: 'Москва', age: 38 },
    { name: 'Анастасия Васильева', phone: '+79261112245', email: 'vasilyeva.a@example.com', city: 'Воронеж', age: 31 },
    { name: 'Роман Фёдоров', phone: '+79261112246', email: 'fedorov.r@example.com', city: 'Самара', age: 29 },
    { name: 'Ксения Михайлова', phone: '+79261112247', email: 'mihaylova.k@example.com', city: 'Москва', age: 20 },
    { name: 'Артём Егоров', phone: '+79261112248', email: 'egorov.a@example.com', city: 'Тюмень', age: 36 },
    { name: 'Полина Павлова', phone: '+79261112249', email: 'pavlova.p@example.com', city: 'Москва', age: 25 },
    { name: 'Никита Семёнов', phone: '+79261112250', email: 'semenov.n@example.com', city: 'Уфа', age: 40 },
  ]

  const contacts = []
  for (let i = 0; i < contactSeed.length; i++) {
    const c = contactSeed[i]
    const chatId = c.phone.replace(/\D/g, '')
    const contact = await prisma.contact.create({
      data: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        companyId: i < 4 ? companies[i % companies.length].id : null,
        custom_fields: { age: c.age, city: c.city },
        channels: {
          create: i % 3 === 0
            ? [{ transport: 'whatsapp', chatId }]
            : i % 3 === 1
              ? [{ transport: 'tgapi', chatId }]
              : [],
        },
      },
    })
    contacts.push(contact)
  }

  // --- Сделки ---
  const stages = [stageNew, stageQualify, stageTrial, stageOffer, stageWon, stageLost]
  const sources = ['instagram', 'vk', 'site', 'referral', 'avito']
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1']
  const courseTypes = ['individual', 'group', 'intensive']

  const deals = []
  const DEAL_COUNT = 32
  for (let i = 0; i < DEAL_COUNT; i++) {
    // Открытые этапы получают больше сделок, чем won/lost — реалистичная форма воронки
    const stage = i < 10 ? stageNew : i < 18 ? stageQualify : i < 23 ? stageTrial : i < 27 ? stageOffer : i < 30 ? stageWon : stageLost
    const contact = contacts[i % contacts.length]
    const assignee = managers[i % managers.length]
    const isClosed = stage.type !== 'open'
    const isLost = stage.type === 'lost'

    const deal = await prisma.deal.create({
      data: {
        title: `${courseTypes[i % courseTypes.length] === 'group' ? 'Групповой курс' : 'Индивидуальные занятия'} — ${contact.name}`,
        budget: (Math.floor(Math.random() * 20) + 5) * 1000,
        stageId: stage.id,
        pipelineId: pipeline.id,
        assigneeId: assignee.id,
        contactId: contact.id,
        companyId: contact.companyId,
        closedAt: isClosed ? new Date(Date.now() - Math.floor(Math.random() * 20) * 86_400_000) : null,
        lostReasonId: isLost ? lostReasons[i % lostReasons.length].id : null,
        lostComment: isLost && i % 2 === 0 ? 'Клиент попросил перезвонить через полгода' : null,
        custom_fields: {
          student_level: levels[i % levels.length],
          course_type: courseTypes[i % courseTypes.length],
          lesson_count: (i % 4 + 1) * 8,
          source: sources[i % sources.length],
        },
      },
    })
    deals.push(deal)
  }

  // --- Переписка: пара реалистичных WhatsApp/email/SMS-тредов на первых сделках ---
  const messageSeed: Array<{ channel: string; direction: 'in' | 'out'; content: string; subject?: string }> = [
    { channel: 'whatsapp', direction: 'in', content: 'Здравствуйте! Подскажите расписание группы для B1' },
    { channel: 'whatsapp', direction: 'out', content: 'Добрый день! Занятия по вторникам и четвергам в 19:00, длительность 90 минут' },
    { channel: 'whatsapp', direction: 'in', content: 'Отлично, а пробный урок можно записаться на эту неделю?' },
    { channel: 'whatsapp', direction: 'out', content: 'Да, конечно! Записал вас на пробный урок, ждём вас 👍' },
  ]
  for (let i = 0; i < 6 && i < deals.length; i++) {
    const deal = deals[i]
    for (const m of messageSeed) {
      await prisma.message.create({
        data: {
          dealId: deal.id,
          contactId: deal.contactId,
          channel: m.channel,
          direction: m.direction,
          content: m.content,
          status: m.direction === 'out' ? 'sent' : 'delivered',
        },
      })
    }
  }
  // Один email-тред
  const emailDeal = deals[6]
  if (emailDeal) {
    await prisma.message.create({
      data: {
        dealId: emailDeal.id,
        contactId: emailDeal.contactId,
        channel: 'email',
        direction: 'out',
        subject: 'Коммерческое предложение — курс английского',
        content: 'Добрый день! Направляем условия обучения и расписание занятий.',
        toAddresses: emailDeal.contactId ? [contacts.find((c) => c.id === emailDeal.contactId)?.email ?? ''] : [],
        threadKey: emailDeal.contactId ?? undefined,
        status: 'sent',
      },
    })
  }

  // --- Пробные уроки: разные статусы ---
  const trialStatuses: Array<'scheduled' | 'completed' | 'no_show'> = ['scheduled', 'completed', 'no_show']
  for (let i = 0; i < 8 && i < deals.length; i++) {
    const deal = deals[i]
    const status = trialStatuses[i % trialStatuses.length]
    const scheduledAt = status === 'scheduled'
      ? new Date(Date.now() + (i + 1) * 86_400_000)
      : new Date(Date.now() - (i + 1) * 86_400_000)
    await prisma.trialLesson.create({
      data: {
        dealId: deal.id,
        scheduledAt,
        status,
        reminderTransport: 'whatsapp',
        reminderChatId: contacts.find((c) => c.id === deal.contactId)?.phone?.replace(/\D/g, '') ?? '',
        reminderTargets: [{ transport: 'whatsapp', chatId: contacts.find((c) => c.id === deal.contactId)?.phone?.replace(/\D/g, '') ?? '' }],
      },
    })
  }

  // --- Абонементы: активный с достаточным балансом, один на грани низкого баланса, один исчерпан ---
  const wonDeals = deals.filter((d) => d.stageId === stageWon.id)
  const subscriptionPlans: Array<{ lessonsUsed: number; status: string }> = [
    { lessonsUsed: 2, status: 'active' },
    { lessonsUsed: 6, status: 'active' }, // осталось 2 из 8 — демонстрирует триггер низкого баланса
    { lessonsUsed: 8, status: 'exhausted' },
    { lessonsUsed: 4, status: 'active' },
  ]
  for (let i = 0; i < subscriptionPlans.length && i < wonDeals.length; i++) {
    const deal = wonDeals[i]
    const pkg = packages[i % packages.length]
    const plan = subscriptionPlans[i]
    const subscription = await prisma.subscription.create({
      data: {
        contactId: deal.contactId!,
        dealId: deal.id,
        packageId: pkg.id,
        packageName: pkg.name,
        lessonsTotal: pkg.lessonsCount,
        lessonsUsed: plan.lessonsUsed,
        price: pkg.price,
        status: plan.status,
        expiresAt: pkg.durationDays ? new Date(Date.now() + pkg.durationDays * 86_400_000) : null,
      },
    })
    for (let l = 0; l < plan.lessonsUsed; l++) {
      await prisma.lesson.create({
        data: {
          subscriptionId: subscription.id,
          teacherId: l % 2 === 0 ? teacher1.id : teacher2.id,
          scheduledAt: new Date(Date.now() - (plan.lessonsUsed - l) * 3 * 86_400_000),
          status: l % 5 === 4 ? 'no_show' : 'completed',
        },
      })
    }
    // Оплата, из которой "возник" абонемент — статус succeeded, как будто прошёл вебхук провайдера
    await prisma.payment.create({
      data: {
        dealId: deal.id,
        contactId: deal.contactId,
        packageId: pkg.id,
        packageName: pkg.name,
        lessonsTotal: pkg.lessonsCount,
        durationDays: pkg.durationDays,
        amount: pkg.price,
        provider: i % 2 === 0 ? 'cloudpayments' : 'robokassa',
        status: 'succeeded',
        paidAt: new Date(Date.now() - (plan.lessonsUsed + 5) * 86_400_000),
      },
    })
  }

  console.log('Демо-стенд заполнен!')
  console.log(`Вход: ${demoEmail} (пароль — из NEXT_PUBLIC_DEMO_PASSWORD)`)
  console.log(`Сделок: ${deals.length}, контактов: ${contacts.length}, абонементов: ${Math.min(subscriptionPlans.length, wonDeals.length)}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
