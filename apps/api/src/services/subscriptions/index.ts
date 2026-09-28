import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'
import { triggerAutomation } from '../automation/engine'
import type { Subscription } from '@prisma/client'

export const subscriptionInclude = {
  package: { select: { id: true, name: true } },
  lessons: {
    orderBy: { scheduledAt: 'desc' as const },
    include: { teacher: { select: { id: true, name: true } } },
  },
}

export function subscriptionBalance(sub: { lessonsTotal: number; lessonsUsed: number }) {
  return sub.lessonsTotal - sub.lessonsUsed
}

/** Истёкшая по сроку, но ещё активная подписка: крона нет, статус вычисляется лениво */
export function isExpired(sub: { status: string; expiresAt: Date | null }) {
  return sub.status === 'active' && sub.expiresAt !== null && sub.expiresAt < new Date()
}

export interface CreateSubscriptionInput {
  contactId: string
  dealId?: string | null
  packageId?: string | null
  packageName: string
  lessonsTotal: number
  price: number | string
  expiresAt?: Date | null
  /** 1:1 с платежом (@unique) — повторный вебхук не создаст дубль подписки */
  paymentId?: string | null
  createdById?: string | null
  activityUserId?: string | null
}

/**
 * Общая точка создания подписки: ручное создание менеджером (наличные/перевод)
 * и платёжный вебхук. Пишет Activity на сделку-источник и эмитит сокет-событие.
 */
export async function createSubscription(input: CreateSubscriptionInput) {
  const subscription = await prisma.subscription.create({
    data: {
      contactId: input.contactId,
      dealId: input.dealId ?? null,
      packageId: input.packageId ?? null,
      packageName: input.packageName,
      lessonsTotal: input.lessonsTotal,
      price: input.price,
      expiresAt: input.expiresAt ?? null,
      paymentId: input.paymentId ?? null,
      createdById: input.createdById ?? null,
    },
    include: subscriptionInclude,
  })

  if (input.dealId) {
    await prisma.activity.create({
      data: {
        dealId: input.dealId,
        userId: input.activityUserId ?? null,
        type: 'subscription_created',
        payload: {
          subscriptionId: subscription.id,
          packageName: input.packageName,
          lessonsTotal: input.lessonsTotal,
          price: String(input.price),
        },
      },
    })
  }

  await emitSubscriptionUpdated(subscription)
  return subscription
}

/** SUBSCRIPTION_UPDATED в комнату сделки и её воронки (по образцу emitTrialUpdated) */
export async function emitSubscriptionUpdated(subscription: Subscription) {
  const payload = { contactId: subscription.contactId, dealId: subscription.dealId, subscriptionId: subscription.id }
  if (subscription.dealId) {
    emitToRoom(`deal:${subscription.dealId}`, 'SUBSCRIPTION_UPDATED', payload)
    const deal = await prisma.deal.findUnique({ where: { id: subscription.dealId }, select: { pipelineId: true } })
    if (deal) emitToRoom(`pipeline:${deal.pipelineId}`, 'SUBSCRIPTION_UPDATED', payload)
  }
}

/**
 * Списание урока: completed и no_show уменьшают баланс, canceled — нет.
 * Guard status='scheduled' в where урока защищает от двойного клика (0 строк → конфликт).
 * Возвращает null при конфликте.
 */
export async function chargeLesson(lessonId: string, newStatus: 'completed' | 'no_show', expectedSubscriptionId?: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { subscription: true },
  })
  if (!lesson) return { error: 'not_found' as const }
  if (expectedSubscriptionId && lesson.subscriptionId !== expectedSubscriptionId) return { error: 'not_found' as const }
  if (lesson.status !== 'scheduled') return { error: 'already_finalized' as const }

  const [updatedCount] = await prisma.$transaction([
    prisma.lesson.updateMany({
      where: { id: lessonId, status: 'scheduled' },
      data: { status: newStatus },
    }),
    prisma.subscription.update({
      where: { id: lesson.subscriptionId },
      data: { lessonsUsed: { increment: 1 } },
    }),
  ])
  if (updatedCount.count === 0) return { error: 'already_finalized' as const }

  // Перечитываем после инкремента; исчерпание фиксируем статусом
  let subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: lesson.subscriptionId },
    include: subscriptionInclude,
  })
  if (subscription.lessonsUsed >= subscription.lessonsTotal && subscription.status === 'active') {
    subscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'exhausted' },
      include: subscriptionInclude,
    })
  }

  if (subscription.dealId) {
    await prisma.activity.create({
      data: {
        dealId: subscription.dealId,
        type: newStatus === 'completed' ? 'lesson_completed' : 'lesson_no_show',
        payload: {
          lessonId,
          subscriptionId: subscription.id,
          remaining: subscriptionBalance(subscription),
        },
      },
    })
  }

  await emitSubscriptionUpdated(subscription)

  // Триггер низкого баланса: матчинг в движке по точному равенству remaining === threshold,
  // поэтому срабатывает ровно один раз — в момент пересечения порога
  const remaining = subscriptionBalance(subscription)
  if (subscription.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: subscription.dealId } })
    if (deal) {
      triggerAutomation({
        type: 'subscription_low_balance',
        deal,
        stageId: deal.stageId,
        remaining,
        subscriptionId: subscription.id,
      }).catch(console.error)
    }
  }

  return { subscription }
}
