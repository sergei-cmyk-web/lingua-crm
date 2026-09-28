import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()
router.use(authMiddleware)

// Справочник причин — конфигурация, мутации admin-only; чтение открыто (нужно менеджерам в диалоге)
const adminOnly = requirePermission('settings.crm')

router.get('/', async (req, res) => {
  const where = req.query.active === 'true' ? { active: true } : {}
  const reasons = await prisma.lostReason.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { deals: true } } },
  })
  return res.json(reasons)
})

const reasonSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
})

router.post('/', adminOnly, validate(reasonSchema), async (req, res, next) => {
  try {
    const reason = await prisma.lostReason.create({ data: req.body })
    return res.status(201).json(reason)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id', adminOnly, validate(reasonSchema.partial().strict()), async (req, res, next) => {
  try {
    const reason = await prisma.lostReason.update({ where: { id: req.params.id }, data: req.body })
    return res.json(reason)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const reason = await prisma.lostReason.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { deals: true } } },
    })
    if (!reason) return res.status(404).json({ error: 'Lost reason not found' })
    if (reason._count.deals > 0) {
      return res.status(409).json({ error: 'reason_in_use', message: 'Причина используется в сделках — деактивируйте её вместо удаления' })
    }
    await prisma.lostReason.delete({ where: { id: req.params.id } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

export default router
