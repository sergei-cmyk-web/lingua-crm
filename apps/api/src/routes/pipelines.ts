import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()
router.use(authMiddleware)

// Pipeline/stage configuration is admin-only; reads stay open to all users.
const adminOnly = requirePermission('settings.crm')

router.get('/', async (_req, res) => {
  const pipelines = await prisma.pipeline.findMany({
    include: {
      stages: { orderBy: { order: 'asc' } },
      _count: { select: { deals: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return res.json(pipelines)
})

router.get('/:id', async (req, res) => {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: req.params.id },
    include: { stages: { orderBy: { order: 'asc' } } },
  })
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' })
  return res.json(pipeline)
})

const createSchema = z.object({
  name: z.string().min(1),
  stages: z.array(z.object({
    name: z.string().min(1),
    color: z.string().default('#6366f1'),
    order: z.number().int(),
    type: z.enum(['open', 'won', 'lost']).default('open'),
  })).optional(),
})

router.post('/', adminOnly, validate(createSchema), async (req, res) => {
  const { name, stages } = req.body
  const pipeline = await prisma.pipeline.create({
    data: {
      name,
      stages: stages ? { create: stages } : undefined,
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  })
  return res.status(201).json(pipeline)
})

router.patch('/:id', adminOnly, async (req, res) => {
  const pipeline = await prisma.pipeline.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
    include: { stages: { orderBy: { order: 'asc' } } },
  })
  return res.json(pipeline)
})

router.delete('/:id', adminOnly, async (req, res) => {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { deals: true } } },
  })
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' })
  if ((pipeline as typeof pipeline & { _count: { deals: number } })._count.deals > 0) {
    return res.status(409).json({ error: 'Cannot delete pipeline with active deals' })
  }
  await prisma.pipeline.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

// Stage management
const stageSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  order: z.number().int(),
  type: z.enum(['open', 'won', 'lost']).default('open'),
})

router.post('/:id/stages', adminOnly, validate(stageSchema), async (req, res) => {
  const stage = await prisma.stage.create({
    data: { ...req.body, pipelineId: req.params.id },
  })
  return res.status(201).json(stage)
})

// strict(): без него клиент мог бы протащить произвольные поля (например pipelineId) прямо в Prisma
router.patch('/stages/:stageId', adminOnly, validate(stageSchema.partial().strict()), async (req, res) => {
  const stage = await prisma.stage.update({
    where: { id: req.params.stageId },
    data: req.body,
  })
  return res.json(stage)
})

// Информация для попапа удаления этапа: сколько активных сделок в этапе и, если уже выбран
// целевой этап переноса, какие обязательные-на-нём поля не заполнены у скольких сделок.
router.get('/stages/:stageId/deletion-check', adminOnly, async (req, res, next) => {
  try {
    const stageId = req.params.stageId
    const targetStageId = typeof req.query.targetStageId === 'string' ? req.query.targetStageId : undefined

    const dealCount = await prisma.deal.count({ where: { stageId, deletedAt: null } })
    // ВСЕ сделки, включая корзину — именно это число решает, потребует ли DELETE targetStageId
    // (см. totalCount в DELETE /stages/:stageId ниже), dealCount выше — только для отображения.
    const totalCount = await prisma.deal.count({ where: { stageId } })

    let requiredFields: { key: string; label: string; missingCount: number }[] = []
    if (targetStageId) {
      const fields = await prisma.fieldDefinition.findMany({
        where: { entityType: 'deal', requiredAtStageIds: { has: targetStageId } },
      })
      if (fields.length > 0) {
        const deals = await prisma.deal.findMany({ where: { stageId, deletedAt: null }, select: { custom_fields: true } })
        requiredFields = fields.map(f => ({
          key: f.key,
          label: f.label,
          missingCount: deals.filter(d => {
            const val = (d.custom_fields as Record<string, unknown>)[f.key]
            return val === null || val === undefined || val === ''
          }).length,
        }))
      }
    }

    return res.json({ dealCount, totalCount, requiredFields })
  } catch (err) {
    return next(err)
  }
})

router.delete('/stages/:stageId', adminOnly, async (req, res, next) => {
  try {
    const stageId = req.params.stageId
    const targetStageId = typeof req.query.targetStageId === 'string' ? req.query.targetStageId : undefined

    // Считаем ВСЕ сделки, ссылающиеся на этап (включая корзину) — иначе delete упадёт по FK,
    // даже если активных сделок (то, что видит пользователь в попапе) уже 0.
    const totalCount = await prisma.deal.count({ where: { stageId } })

    if (totalCount > 0) {
      if (!targetStageId) {
        return res.status(409).json({ error: 'deals_exist' })
      }
      const [sourceStage, targetStage] = await Promise.all([
        prisma.stage.findUnique({ where: { id: stageId } }),
        prisma.stage.findUnique({ where: { id: targetStageId } }),
      ])
      if (!sourceStage || !targetStage || targetStage.pipelineId !== sourceStage.pipelineId || targetStage.id === stageId) {
        return res.status(400).json({ error: 'invalid_target_stage' })
      }

      const closureData =
        targetStage.type === 'lost' || targetStage.type === 'won'
          ? { closedAt: new Date() }
          : { closedAt: null, lostReasonId: null, lostComment: null }

      await prisma.deal.updateMany({
        where: { stageId },
        data: { stageId: targetStageId, stageEnteredAt: new Date(), ...closureData },
      })
    }

    await prisma.stage.delete({ where: { id: stageId } })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

export default router
