import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { findContactDuplicateGroups, findContactMatches, mergeContacts } from '../services/dedup/contacts'
import { parsePagination } from '../lib/pagination'
const router = Router()
router.use(authMiddleware)

const contactInclude = {
  company: { select: { id: true, name: true } },
  phones: { select: { id: true, phone: true, label: true }, orderBy: { createdAt: 'asc' as const } },
  emails: { select: { id: true, email: true, label: true }, orderBy: { createdAt: 'asc' as const } },
  channels: { select: { id: true, transport: true, chatId: true } },
}

router.get('/', async (req, res) => {
  const { search, companyId, tags } = req.query
  const { limit, skip } = parsePagination(req.query)
  const where: Record<string, unknown> = { deletedAt: null }
  if (search) where.name = { contains: search as string, mode: 'insensitive' }
  if (companyId) where.companyId = companyId
  if (tags) where.tags = { hasSome: (tags as string).split(',').filter(Boolean) }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        ...contactInclude,
        _count: { select: { deals: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ])
  return res.json({ contacts, total })
})

// Список всех тегов, реально использованных в недалённых контактах — для автокомплита/фильтра
router.get('/tags', async (_req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM "Contact" WHERE "deletedAt" IS NULL ORDER BY tag
  `
  return res.json(rows.map(r => r.tag))
})

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) })

// Мягкое удаление нескольких контактов разом (выбор чекбоксами в списке)
router.post('/bulk-delete', requirePermission('trash.manage'), validate(bulkDeleteSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as { ids: string[] }
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return res.json({ deleted: result.count })
  } catch (err) {
    return next(err)
  }
})

// Группы потенциальных дублей (совпадение по телефону ИЛИ email) — только admin
router.get('/duplicates', requirePermission('trash.manage'), async (_req, res, next) => {
  try {
    const groups = await findContactDuplicateGroups()
    return res.json({ groups })
  } catch (err) {
    return next(err)
  }
})

const mergeSchema = z.object({ ids: z.array(z.string()).min(2), strategy: z.enum(['newest', 'oldest']) })

// Объединение дублей: "выживает" контакт по стратегии (новый/старый по дате создания),
// связанные сделки/задачи/сообщения/абонементы/счета переносятся на него, остальные — в корзину
router.post('/merge', requirePermission('trash.manage'), validate(mergeSchema), async (req, res, next) => {
  try {
    const { ids, strategy } = req.body as { ids: string[]; strategy: 'newest' | 'oldest' }
    const survivor = await mergeContacts(ids, strategy)
    return res.json(survivor)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Need at least')) {
      return res.status(400).json({ error: err.message })
    }
    return next(err)
  }
})

router.get('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      ...contactInclude,
      company: true,
      deals: {
        where: { deletedAt: null },
        include: { stage: true, pipeline: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      tasks: { orderBy: { createdAt: 'desc' }, take: 10 },
      messages: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!contact) return res.status(404).json({ error: 'Contact not found' })
  return res.json(contact)
})

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telegramUsername: z.string().optional(),
  companyId: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  force: z.boolean().optional(),
})

router.post('/', requirePermission('entities.edit'), validate(createSchema), async (req, res, next) => {
  try {
    const { force, ...data } = req.body
    if (!force) {
      const matches = await findContactMatches(data.phone, data.email)
      if (matches.length > 0) {
        return res.status(409).json({ error: 'duplicate_contact', matches })
      }
    }
    const contact = await prisma.contact.create({ data, include: contactInclude })
    return res.status(201).json(contact)
  } catch (err) {
    return next(err)
  }
})

// Allowlist скалярных полей контакта; phones/emails/channels управляются отдельными
// под-роутами и вырезаются из тела ДО валидации — поэтому здесь не validate()-middleware,
// а ручной safeParse, .strict() всё равно отклоняет deletedAt и любые прочие лишние ключи.
const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    telegramUsername: z.string().optional(),
    wazzupChatId: z.string().optional(),
    wazzupChannel: z.string().optional(),
    companyId: z.string().optional(),
    custom_fields: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

router.patch('/:id', requirePermission('entities.edit'), async (req, res) => {
  const { phones: _phones, emails: _emails, channels: _channels, ...rest } = req.body
  const result = patchSchema.safeParse(rest)
  if (!result.success) {
    return res.status(400).json({ error: 'Validation error', details: result.error.flatten() })
  }
  const contact = await prisma.contact.update({
    where: { id: req.params.id },
    data: result.data as Prisma.ContactUncheckedUpdateInput,
    include: contactInclude,
  })
  return res.json(contact)
})

// Мягкое удаление: контакт уходит в корзину; его сделки остаются в воронке со связью
router.delete('/:id', requirePermission('trash.manage'), async (req, res, next) => {
  try {
    await prisma.contact.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

// --- Phones ---

router.post('/:id/phones', requirePermission('entities.edit'), async (req, res, next) => {
  try {
    const { phone, label } = req.body
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone required' })
    const record = await prisma.contactPhone.create({
      data: { contactId: req.params.id, phone: phone.trim(), label: label ?? 'mobile' },
    })
    return res.status(201).json(record)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id/phones/:phoneId', requirePermission('entities.edit'), async (req, res, next) => {
  try {
    await prisma.contactPhone.delete({ where: { id: req.params.phoneId } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

// --- Emails ---

router.post('/:id/emails', requirePermission('entities.edit'), async (req, res, next) => {
  try {
    const { email, label } = req.body
    const trimmed = typeof email === 'string' ? email.trim() : ''
    if (!trimmed || !z.string().email().safeParse(trimmed).success) {
      return res.status(400).json({ error: 'Valid email required' })
    }
    const record = await prisma.contactEmail.create({
      data: { contactId: req.params.id, email: trimmed, label: label ?? null },
    })
    return res.status(201).json(record)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id/emails/:emailId', requirePermission('entities.edit'), async (req, res, next) => {
  try {
    await prisma.contactEmail.delete({ where: { id: req.params.emailId } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

export default router
