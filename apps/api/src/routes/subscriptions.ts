import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  createSubscription,
  emitSubscriptionUpdated,
  chargeLesson,
  subscriptionInclude,
  subscriptionBalance,
  isExpired,
} from '../services/subscriptions'
import { canViewContact } from '../services/chats/access'

const router = Router()
router.use(authMiddleware)

// Деньги/баланс уроков — admin+manager; teacher (роль для селекта преподавателя в уроках) не мутирует.
const financeRole = requirePermission('finance.manage')

function serialize(sub: Awaited<ReturnType<typeof prisma.subscription.findFirstOrThrow>> & { lessons?: unknown[] }) {
  return {
    ...sub,
    balance: subscriptionBalance(sub),
    // Срок вышел, статус ещё active — показываем как истёкший (крона нет, вычисляется лениво)
    effectiveStatus: isExpired(sub) ? 'expired' : sub.status,
  }
}

router.get('/', async (req: AuthRequest, res) => {
  const { contactId, dealId } = req.query
  if (!contactId && !dealId) return res.status(400).json({ error: 'contactId or dealId required' })

  // Видимость — как у чатов (canViewContact): data.viewAll или ответственный по сделке контакта.
  // Абонемент принадлежит контакту, поэтому при запросе по dealId проверяем контакт этой сделки.
  let ownerContactId = contactId as string | undefined
  if (!ownerContactId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId as string }, select: { contactId: true } })
    ownerContactId = deal?.contactId ?? undefined
  }
  if (ownerContactId && !(await canViewContact(req.user!, ownerContactId))) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...(contactId ? { contactId: contactId as string } : {}),
      ...(dealId ? { dealId: dealId as string } : {}),
    },
    include: subscriptionInclude,
    orderBy: { createdAt: 'desc' },
  })
  return res.json(subscriptions.map(serialize))
})

const createSchema = z.object({
  contactId: z.string().min(1),
  dealId: z.string().optional(),
  packageId: z.string().min(1),
  lessonsTotal: z.number().int().positive().optional(), // override пакета
  price: z.number().nonnegative().optional(), // override пакета
  expiresAt: z.string().datetime().optional(),
})

// Ручное создание (оплата наличными/переводом); платёжный вебхук использует createSubscription напрямую
router.post('/', financeRole, validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const { contactId, dealId, packageId, lessonsTotal, price, expiresAt } = req.body

    const [contact, pkg] = await Promise.all([
      prisma.contact.findUnique({ where: { id: contactId } }),
      prisma.package.findUnique({ where: { id: packageId } }),
    ])
    if (!contact) return res.status(404).json({ error: 'Contact not found' })
    if (!pkg) return res.status(404).json({ error: 'Package not found' })

    const resolvedExpiresAt = expiresAt
      ? new Date(expiresAt)
      : pkg.durationDays
        ? new Date(Date.now() + pkg.durationDays * 86400_000)
        : null

    const subscription = await createSubscription({
      contactId,
      dealId: dealId ?? null,
      packageId,
      packageName: pkg.name,
      lessonsTotal: lessonsTotal ?? pkg.lessonsCount,
      price: price ?? Number(pkg.price),
      expiresAt: resolvedExpiresAt,
      createdById: req.user!.id,
      activityUserId: req.user!.id,
    })
    return res.status(201).json(serialize(subscription))
  } catch (err) {
    return next(err)
  }
})

const patchSchema = z
  .object({
    status: z.enum(['canceled']).optional(),
    lessonsTotal: z.number().int().positive().optional(), // ручная корректировка баланса
  })
  .refine(d => d.status !== undefined || d.lessonsTotal !== undefined, {
    message: 'Передайте status или lessonsTotal',
  })

router.patch('/:id', financeRole, validate(patchSchema), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Subscription not found' })

    const { status, lessonsTotal } = req.body
    const data: Record<string, unknown> = {}
    if (status) data.status = status
    if (lessonsTotal !== undefined) {
      data.lessonsTotal = lessonsTotal
      // Корректировка может вывести из exhausted или наоборот
      if (!status) {
        data.status =
          existing.status === 'exhausted' && lessonsTotal > existing.lessonsUsed
            ? 'active'
            : existing.status === 'active' && lessonsTotal <= existing.lessonsUsed
              ? 'exhausted'
              : existing.status
      }
    }

    const subscription = await prisma.subscription.update({
      where: { id: req.params.id },
      data,
      include: subscriptionInclude,
    })
    await emitSubscriptionUpdated(subscription)
    return res.json(serialize(subscription))
  } catch (err) {
    return next(err)
  }
})

const createLessonSchema = z.object({
  scheduledAt: z.string().datetime(),
  teacherId: z.string().optional(),
  note: z.string().optional(),
})

router.post('/:id/lessons', financeRole, validate(createLessonSchema), async (req: AuthRequest, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } })
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' })
    if (subscription.status !== 'active') {
      return res.status(409).json({ error: 'subscription_not_active', message: 'Абонемент не активен' })
    }
    if (isExpired(subscription)) {
      return res.status(409).json({ error: 'subscription_expired', message: 'Срок действия абонемента истёк' })
    }
    if (subscriptionBalance(subscription) <= 0) {
      return res.status(409).json({ error: 'subscription_exhausted', message: 'На балансе не осталось уроков' })
    }

    const lesson = await prisma.lesson.create({
      data: {
        subscriptionId: subscription.id,
        scheduledAt: new Date(req.body.scheduledAt),
        teacherId: req.body.teacherId ?? null,
        note: req.body.note ?? null,
        createdById: req.user!.id,
      },
      include: { teacher: { select: { id: true, name: true } } },
    })
    await emitSubscriptionUpdated(subscription)
    return res.status(201).json(lesson)
  } catch (err) {
    return next(err)
  }
})

const patchLessonSchema = z.object({
  status: z.enum(['completed', 'no_show', 'canceled']).optional(),
  teacherId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
})

router.patch('/:id/lessons/:lessonId', financeRole, validate(patchLessonSchema), async (req: AuthRequest, res, next) => {
  try {
    const { status, teacherId, scheduledAt } = req.body

    // Списание (completed/no_show) — через сервис с транзакцией и guard-ом от двойного клика
    if (status === 'completed' || status === 'no_show') {
      const result = await chargeLesson(req.params.lessonId, status, req.params.id)
      if ('error' in result) {
        if (result.error === 'not_found') return res.status(404).json({ error: 'Lesson not found' })
        return res.status(409).json({ error: 'lesson_already_finalized', message: 'Урок уже завершён' })
      }
      return res.json(serialize(result.subscription))
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.lessonId },
      include: { subscription: true },
    })
    if (!lesson || lesson.subscriptionId !== req.params.id) {
      return res.status(404).json({ error: 'Lesson not found' })
    }

    if (status === 'canceled' && lesson.status !== 'scheduled') {
      return res.status(409).json({ error: 'lesson_already_finalized', message: 'Урок уже завершён' })
    }

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        ...(status ? { status } : {}),
        ...(teacherId !== undefined ? { teacherId } : {}),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
      },
    })

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: req.params.id },
      include: subscriptionInclude,
    })
    await emitSubscriptionUpdated(subscription)
    return res.json(serialize(subscription))
  } catch (err) {
    return next(err)
  }
})

export default router
