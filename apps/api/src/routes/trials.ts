import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { emitToRoom } from '../socket/handlers'
import { triggerAutomation } from '../services/automation/engine'
import type { TrialLesson } from '@prisma/client'

const router = Router()
router.use(authMiddleware)

export function emitTrialUpdated(pipelineId: string, dealId: string, trial: TrialLesson) {
  const payload = { dealId, trial }
  emitToRoom(`pipeline:${pipelineId}`, 'TRIAL_UPDATED', payload)
  emitToRoom(`deal:${dealId}`, 'TRIAL_UPDATED', payload)
}

const trialTargetSchema = z.object({
  transport: z.string().min(1),
  chatId: z.string().min(1),
})

const patchSchema = z
  .object({
    scheduledAt: z.string().datetime().optional(),
    status: z.enum(['completed', 'no_show', 'canceled']).optional(),
    reminderTargets: z.array(trialTargetSchema).min(1).optional(),
  })
  .refine(
    d => (d.status ? !d.scheduledAt && !d.reminderTargets : !!d.scheduledAt || !!d.reminderTargets),
    { message: 'Передайте scheduledAt/reminderTargets (перенос, каналы) либо status (результат)' }
  )

// Очереди BullMQ всегда ПОСЛЕ записи в БД и fire-and-forget (замечание 7):
// при недоступном Redis запрос не должен ни зависнуть, ни откатить действие менеджера.
// Гварды воркера (status/scheduledAt-снапшот) обезвреживают неотменённые джобы,
// sweep из Postgres догоняет незапланированные.
router.patch('/:id', validate(patchSchema), async (req: AuthRequest, res, next) => {
  try {
    const trial = await prisma.trialLesson.findUnique({
      where: { id: req.params.id },
      include: { deal: true },
    })
    if (!trial) return res.status(404).json({ error: 'Пробный урок не найден' })
    if (trial.status !== 'scheduled') {
      return res.status(400).json({ error: 'Урок уже завершён или отменён' })
    }

    const reminderTargets = req.body.reminderTargets as Array<{ transport: string; chatId: string }> | undefined
    const targetFields = reminderTargets
      ? {
          reminderTargets,
          reminderTransport: reminderTargets[0].transport,
          reminderChatId: reminderTargets[0].chatId,
        }
      : {}

    // Перенос (и/или смена каналов): сбросить отметки, перепланировать напоминания
    if (req.body.scheduledAt) {
      const scheduledAt = new Date(req.body.scheduledAt)
      if (scheduledAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Новое время урока должно быть в будущем' })
      }

      const updated = await prisma.trialLesson.update({
        where: { id: trial.id },
        data: { scheduledAt, remindersSent: [], ...targetFields },
      })

      await prisma.activity.create({
        data: {
          dealId: trial.dealId,
          userId: req.user!.id,
          type: 'trial_rescheduled',
          payload: { from: trial.scheduledAt.toISOString(), to: scheduledAt.toISOString() },
        },
      })

      import('../services/trial-reminders/worker')
        .then(async ({ scheduleTrialReminders, cancelTrialReminders }) => {
          await cancelTrialReminders(trial) // джобы старого scheduledAt
          await scheduleTrialReminders(updated)
        })
        .catch(err => console.error('[trials] не удалось перепланировать напоминания:', err))

      emitTrialUpdated(trial.deal.pipelineId, trial.dealId, updated)
      return res.json(updated)
    }

    // Только смена каналов напоминаний: джобы трогать не нужно —
    // воркер перечитывает урок из БД в момент отправки и возьмёт новые каналы
    if (reminderTargets && !req.body.status) {
      const updated = await prisma.trialLesson.update({
        where: { id: trial.id },
        data: targetFields,
      })

      await prisma.activity.create({
        data: {
          dealId: trial.dealId,
          userId: req.user!.id,
          type: 'trial_channels_changed',
          payload: { transports: reminderTargets.map(t => t.transport) },
        },
      })

      emitTrialUpdated(trial.deal.pipelineId, trial.dealId, updated)
      return res.json(updated)
    }

    // Результат: completed | no_show | canceled
    const status = req.body.status as 'completed' | 'no_show' | 'canceled'
    const updated = await prisma.trialLesson.update({
      where: { id: trial.id },
      data: { status },
    })

    import('../services/trial-reminders/worker')
      .then(({ cancelTrialReminders }) => cancelTrialReminders(trial))
      .catch(err => console.error('[trials] не удалось снять напоминания:', err))

    await prisma.activity.create({
      data: {
        dealId: trial.dealId,
        userId: req.user!.id,
        type: 'trial_result',
        payload: { status, scheduledAt: trial.scheduledAt.toISOString() },
      },
    })

    // Реактивационные цепочки; для canceled триггер не эмитим
    if (status === 'completed' || status === 'no_show') {
      triggerAutomation({
        type: status === 'completed' ? 'trial_completed' : 'trial_no_show',
        deal: trial.deal,
        stageId: trial.deal.stageId,
      }).catch(console.error)
    }

    emitTrialUpdated(trial.deal.pipelineId, trial.dealId, updated)
    return res.json(updated)
  } catch (err) {
    return next(err)
  }
})

export default router
