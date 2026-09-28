import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { parsePagination } from '../lib/pagination'

const requiresResult = (data: { completed?: boolean; result?: string }) =>
  data.completed === true && !data.result?.trim()

const router = Router()
router.use(authMiddleware)

router.get('/', async (req: AuthRequest, res) => {
  const { dealId, contactId, assigneeId, completed } = req.query
  const { limit, skip } = parsePagination(req.query)
  const where: Record<string, unknown> = {}
  if (dealId) where.dealId = dealId
  if (contactId) where.contactId = contactId
  if (assigneeId) where.assigneeId = assigneeId
  if (completed !== undefined) where.completed = completed === 'true'

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
    },
    orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    skip,
    take: limit,
  })
  return res.json(tasks)
})

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  assigneeId: z.string(),
})

router.post('/', validate(schema), async (req, res) => {
  const task = await prisma.task.create({
    data: req.body,
    include: { assignee: { select: { id: true, name: true } } },
  })
  return res.status(201).json(task)
})

const patchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    completed: z.boolean().optional(),
    result: z.string().optional(),
    dealId: z.string().optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    assigneeId: z.string().optional(),
  })
  .strict()

router.patch('/:id', validate(patchSchema), async (req: AuthRequest, res) => {
  if (requiresResult(req.body)) {
    return res.status(422).json({ error: 'result_required' })
  }

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: req.body,
    include: { assignee: { select: { id: true, name: true } } },
  })

  if (req.body.completed === true && task.dealId) {
    await prisma.activity.create({
      data: {
        dealId: task.dealId,
        userId: req.user!.id,
        type: 'task_completed',
        payload: { title: task.title, result: task.result },
      },
    })
  }

  return res.json(task)
})

router.delete('/:id', async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

export default router
