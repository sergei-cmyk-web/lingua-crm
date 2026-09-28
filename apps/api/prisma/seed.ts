import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Demo seed is opt-in — never create known accounts unless explicitly enabled.
  if (process.env.SEED_DEMO !== 'true') {
    console.log('Skipping demo seed (set SEED_DEMO=true to enable).')
    return
  }

  console.log('Seeding database...')

  // Users — password comes from env, not hardcoded.
  const demoPassword = process.env.SEED_DEMO_PASSWORD
  if (!demoPassword) {
    throw new Error('SEED_DEMO_PASSWORD is required when SEED_DEMO=true')
  }
  const passwordHash = await bcrypt.hash(demoPassword, 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@crm.local' },
    update: {},
    create: { email: 'admin@crm.local', name: 'Администратор', roleId: 'role_admin_system', passwordHash },
  })
  const manager1 = await prisma.user.upsert({
    where: { email: 'manager1@crm.local' },
    update: {},
    create: { email: 'manager1@crm.local', name: 'Анна Иванова', roleId: 'role_manager_system', passwordHash },
  })
  const manager2 = await prisma.user.upsert({
    where: { email: 'manager2@crm.local' },
    update: {},
    create: { email: 'manager2@crm.local', name: 'Пётр Сидоров', roleId: 'role_manager_system', passwordHash },
  })
  // Преподаватели — для селекта в уроках абонемента
  await prisma.user.upsert({
    where: { email: 'teacher1@crm.local' },
    update: {},
    create: { email: 'teacher1@crm.local', name: 'Мария Петрова (англ.)', roleId: 'role_teacher_system', passwordHash },
  })
  await prisma.user.upsert({
    where: { email: 'teacher2@crm.local' },
    update: {},
    create: { email: 'teacher2@crm.local', name: 'Джон Смит (англ.)', roleId: 'role_teacher_system', passwordHash },
  })

  // Pipeline
  const pipeline = await prisma.pipeline.upsert({
    where: { id: 'pipeline-main' },
    update: {},
    create: {
      id: 'pipeline-main',
      name: 'Продажа курсов',
      stages: {
        create: [
          { name: 'Новый лид', color: '#94a3b8', order: 0 },
          { name: 'Квалификация', color: '#3b82f6', order: 1 },
          { name: 'Пробный урок', color: '#f59e0b', order: 2 },
          { name: 'Коммерческое предложение', color: '#8b5cf6', order: 3 },
          { name: 'Успешно закрыта', color: '#22c55e', order: 4 },
        ],
      },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  })

  // Field definitions
  const fieldDefs = [
    { entityType: 'deal', key: 'student_level', label: 'Уровень ученика', fieldType: 'select', order: 0, options: [{ value: 'A1', label: 'A1 — Начинающий' }, { value: 'A2', label: 'A2' }, { value: 'B1', label: 'B1 — Средний' }, { value: 'B2', label: 'B2' }, { value: 'C1', label: 'C1 — Продвинутый' }] },
    { entityType: 'deal', key: 'course_type', label: 'Тип курса', fieldType: 'select', order: 1, options: [{ value: 'individual', label: 'Индивидуальный' }, { value: 'group', label: 'Групповой' }, { value: 'intensive', label: 'Интенсив' }] },
    { entityType: 'deal', key: 'lesson_count', label: 'Количество уроков', fieldType: 'number', order: 2 },
    { entityType: 'deal', key: 'trial_date', label: 'Дата пробного урока', fieldType: 'date', order: 3 },
    { entityType: 'deal', key: 'source', label: 'Источник лида', fieldType: 'select', order: 4, options: [{ value: 'instagram', label: 'Instagram' }, { value: 'vk', label: 'ВКонтакте' }, { value: 'avito', label: 'Avito' }, { value: 'referral', label: 'Сарафан' }, { value: 'site', label: 'Сайт' }] },
    { entityType: 'contact', key: 'age', label: 'Возраст', fieldType: 'number', order: 0 },
    { entityType: 'contact', key: 'city', label: 'Город', fieldType: 'text', order: 1 },
  ]

  for (const fd of fieldDefs) {
    const exists = await prisma.fieldDefinition.findFirst({
      where: { entityType: fd.entityType, key: fd.key, pipelineId: null },
    })
    if (!exists) {
      await prisma.fieldDefinition.create({
        data: { ...fd, options: fd.options ?? null, pipelineId: null },
      })
    }
  }

  // Companies
  const company1 = await prisma.company.create({ data: { name: 'ООО Лингво Плюс' } })

  // Contacts
  const contact1 = await prisma.contact.create({ data: { name: 'Мария Петрова', phone: '+79001112233', email: 'maria@example.com', companyId: company1.id, custom_fields: { age: 28, city: 'Москва' } } })
  const contact2 = await prisma.contact.create({ data: { name: 'Иван Козлов', phone: '+79003334455', email: 'ivan@example.com', custom_fields: { age: 35, city: 'СПб' } } })
  const contact3 = await prisma.contact.create({ data: { name: 'Ольга Смирнова', phone: '+79005556677', custom_fields: { city: 'Казань' } } })

  const stages = pipeline.stages
  const contacts = [contact1, contact2, contact3]
  const managers = [manager1, manager2, admin]
  const sources = ['instagram', 'vk', 'site', 'referral', 'avito']
  const levels = ['A1', 'A2', 'B1', 'B2']
  const courseTypes = ['individual', 'group', 'intensive']

  for (let i = 0; i < 10; i++) {
    const stage = stages[i % stages.length]
    const contact = contacts[i % contacts.length]
    const assignee = managers[i % managers.length]
    await prisma.deal.create({
      data: {
        title: `Сделка #${i + 1} — ${contact.name}`,
        budget: (Math.floor(Math.random() * 20) + 5) * 1000,
        stageId: stage.id,
        pipelineId: pipeline.id,
        assigneeId: assignee.id,
        contactId: contact.id,
        companyId: i < 3 ? company1.id : null,
        custom_fields: {
          student_level: levels[i % levels.length],
          course_type: courseTypes[i % courseTypes.length],
          lesson_count: (i + 1) * 8,
          source: sources[i % sources.length],
        },
      },
    })
  }

  console.log('Seed complete!')
  console.log('Users created (password from SEED_DEMO_PASSWORD):')
  console.log('  admin@crm.local     (admin)')
  console.log('  manager1@crm.local')
  console.log('  manager2@crm.local')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
