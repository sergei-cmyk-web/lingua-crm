import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()
router.use(authMiddleware)

// Automation configuration is admin-only; reads stay open to all users.
const adminOnly = requirePermission('settings.crm')

const triggerSchema = z.object({
  type: z.enum([
    'stage_enter',
    'stage_leave',
    'field_change',
    'webhook',
    'timer',
    'trial_booked',
    'trial_completed',
    'trial_no_show',
    'subscription_low_balance',
    'payment_received',
  ]),
  stageId: z.string().optional(),
  fieldKey: z.string().optional(),
  fieldValue: z.unknown().optional(),
  delayHours: z.number().positive().optional(),
  threshold: z.number().int().positive().optional(), // порог остатка уроков для subscription_low_balance
  channelId: z.string().optional(), // конкретный подключённый WazzUp-канал для webhook-триггера; пусто — любой
})

const actionSchema = z.object({
  type: z.enum(['create_task', 'send_wazzup_message', 'change_field', 'move_stage', 'notify_user', 'send_http_request']),
  taskTitle: z.string().optional(),
  taskDueDateHours: z.number().optional(),
  taskAssigneeId: z.string().optional(),
  message: z.string().optional(),
  transport: z.string().optional(),
  fieldKey: z.string().optional(),
  fieldValue: z.unknown().optional(),
  stageId: z.string().optional(),
  userId: z.string().optional(),
  httpUrl: z.string().optional(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  httpHeaders: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  httpBody: z.string().optional(),
})

const automationSchema = z.object({
  name: z.string().min(1),
  pipelineId: z.string(),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1),
  active: z.boolean().default(true),
})

router.get('/', async (req, res) => {
  const { pipelineId } = req.query
  const automations = await prisma.automation.findMany({
    where: pipelineId ? { pipelineId: pipelineId as string } : {},
    orderBy: { createdAt: 'asc' },
  })
  return res.json(automations)
})

router.post('/', adminOnly, validate(automationSchema), async (req, res) => {
  const automation = await prisma.automation.create({ data: req.body })
  return res.status(201).json(automation)
})

router.patch('/:id', adminOnly, validate(automationSchema.partial().strict()), async (req, res) => {
  const automation = await prisma.automation.update({
    where: { id: req.params.id },
    data: req.body,
  })
  return res.json(automation)
})

router.delete('/:id', adminOnly, async (req, res) => {
  await prisma.automation.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

export default router
