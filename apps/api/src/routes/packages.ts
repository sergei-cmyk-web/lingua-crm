import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()
router.use(authMiddleware)

// Справочник тарифов — конфигурация, мутации admin-only; чтение всем (селект при выставлении счёта)
const adminOnly = requirePermission('settings.crm')

router.get('/', async (req, res) => {
  const where = req.query.active === 'true' ? { active: true } : {}
  const packages = await prisma.package.findMany({
    where,
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { subscriptions: true } } },
  })
  return res.json(packages)
})

const packageSchema = z.object({
  name: z.string().min(1),
  lessonsCount: z.number().int().positive(),
  lessonDurationMinutes: z.number().int().positive().nullable().optional(),
  durationDays: z.number().int().positive().nullable().optional(),
  price: z.number().nonnegative(),
  active: z.boolean().optional(),
})

router.post('/', adminOnly, validate(packageSchema), async (req, res, next) => {
  try {
    const pkg = await prisma.package.create({ data: req.body })
    return res.status(201).json(pkg)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id', adminOnly, validate(packageSchema.partial().strict()), async (req, res, next) => {
  try {
    const pkg = await prisma.package.update({ where: { id: req.params.id }, data: req.body })
    return res.json(pkg)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const pkg = await prisma.package.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { subscriptions: true } } },
    })
    if (!pkg) return res.status(404).json({ error: 'Package not found' })
    if (pkg._count.subscriptions > 0) {
      return res.status(409).json({ error: 'package_in_use', message: 'По пакету есть абонементы — деактивируйте его вместо удаления' })
    }
    await prisma.package.delete({ where: { id: req.params.id } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

export default router
