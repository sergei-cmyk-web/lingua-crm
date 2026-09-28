import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { findCompanyDuplicateGroups, findCompanyMatches, mergeCompanies } from '../services/dedup/companies'
import { parsePagination } from '../lib/pagination'

const router = Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  const { search } = req.query
  const { limit, skip } = parsePagination(req.query)
  const where = {
    deletedAt: null,
    ...(search ? { name: { contains: search as string, mode: 'insensitive' as const } } : {}),
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: { _count: { select: { contacts: true, deals: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.company.count({ where }),
  ])
  return res.json({ companies, total })
})

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) })

// Мягкое удаление нескольких компаний разом (выбор чекбоксами в списке)
router.post('/bulk-delete', requirePermission('trash.manage'), validate(bulkDeleteSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as { ids: string[] }
    const result = await prisma.company.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return res.json({ deleted: result.count })
  } catch (err) {
    return next(err)
  }
})

// Группы потенциальных дублей (точное совпадение имени без учёта регистра) — только admin
router.get('/duplicates', requirePermission('trash.manage'), async (_req, res, next) => {
  try {
    const groups = await findCompanyDuplicateGroups()
    return res.json({ groups })
  } catch (err) {
    return next(err)
  }
})

const mergeSchema = z.object({ ids: z.array(z.string()).min(2), strategy: z.enum(['newest', 'oldest']) })

// Объединение дублей: "выживает" компания по стратегии (новый/старый по дате создания),
// контакты и сделки остальных переносятся на неё, остальные — в корзину
router.post('/merge', requirePermission('trash.manage'), validate(mergeSchema), async (req, res, next) => {
  try {
    const { ids, strategy } = req.body as { ids: string[]; strategy: 'newest' | 'oldest' }
    const survivor = await mergeCompanies(ids, strategy)
    return res.json(survivor)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Need at least')) {
      return res.status(400).json({ error: err.message })
    }
    return next(err)
  }
})

router.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
      deals: { where: { deletedAt: null }, include: { stage: true }, orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!company) return res.status(404).json({ error: 'Company not found' })
  return res.json(company)
})

const schema = z.object({
  name: z.string().min(1),
  custom_fields: z.record(z.unknown()).optional().default({}),
  force: z.boolean().optional(),
})

router.post('/', requirePermission('entities.edit'), validate(schema), async (req, res, next) => {
  try {
    const { force, ...data } = req.body
    if (!force) {
      const matches = await findCompanyMatches(data.name)
      if (matches.length > 0) {
        return res.status(409).json({ error: 'duplicate_company', matches })
      }
    }
    const company = await prisma.company.create({ data })
    return res.status(201).json(company)
  } catch (err) {
    return next(err)
  }
})

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    custom_fields: z.record(z.unknown()).optional(),
  })
  .strict()

router.patch('/:id', requirePermission('entities.edit'), validate(patchSchema), async (req, res) => {
  const company = await prisma.company.update({ where: { id: req.params.id }, data: req.body })
  return res.json(company)
})

// Мягкое удаление: компания уходит в корзину; сделки и контакты остаются со связью
router.delete('/:id', requirePermission('trash.manage'), async (req, res, next) => {
  try {
    await prisma.company.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

export default router
