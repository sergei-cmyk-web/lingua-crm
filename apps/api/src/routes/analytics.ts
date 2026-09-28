import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { cacheGet, cacheSet } from '../lib/redis'
import { authMiddleware, requirePermission } from '../middleware/auth'

const router = Router()
router.use(authMiddleware, requirePermission('section.analytics'))

router.get('/pipeline/:pipelineId', async (req, res) => {
  const { pipelineId } = req.params
  const { from, to } = req.query

  // Кэш 5 мин: агрегации по 100k сделок дорогие, а точность до минуты в аналитике не нужна.
  // Инвалидации нет — приемлемая просрочка ≤5 мин (так и заявлено в архитектуре).
  const cacheKey = `analytics:pipeline:${pipelineId}:${from ?? ''}:${to ?? ''}`
  const cached = await cacheGet(cacheKey)
  if (cached) return res.json(JSON.parse(cached))

  // deletedAt: null — сделки из корзины не участвуют в метриках
  const dateFilter = {
    deletedAt: null,
    ...(from && to
      ? { createdAt: { gte: new Date(from as string), lte: new Date(to as string) } }
      : {}),
  }

  // Пробные уроки фильтруются по времени урока, не по дате создания записи
  const trialDateFilter = from && to
    ? { scheduledAt: { gte: new Date(from as string), lte: new Date(to as string) } }
    : {}
  const trialWhere = { deal: { pipelineId, deletedAt: null }, ...trialDateFilter }

  // Источники (UTM) считаются raw-SQL — group by JSONB-пути и FILTER по типу этапа Prisma не умеет
  const utmDateCondition =
    from && to
      ? Prisma.sql`AND d."createdAt" BETWEEN ${new Date(from as string)} AND ${new Date(to as string)}`
      : Prisma.empty

  const [stages, totalDeals, wonDeals, lostDeals, lostByReason, totalBudget, byAssignee, byMonth, trialsBooked, trialsCompleted, trialsNoShow, stageCounts, completedTrialDeals, utmSourcesRaw, pipelineSubscriptions] = await Promise.all([
    // Deals count and budget per stage
    prisma.stage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { deals: { where: { deletedAt: null } } } },
        deals: {
          where: dateFilter,
          select: { budget: true },
        },
      },
    }),

    // Total deals
    prisma.deal.count({ where: { pipelineId, ...dateFilter } }),

    // Выиграно / потеряно — по типу этапа (раньше «закрытыми» считался последний этап по order)
    prisma.deal.count({ where: { pipelineId, stage: { type: 'won' }, ...dateFilter } }),
    prisma.deal.count({ where: { pipelineId, stage: { type: 'lost' }, ...dateFilter } }),

    // Разбивка потерянных по причинам (null = причина не указана, напр. перенос автоматизацией)
    prisma.deal.groupBy({
      by: ['lostReasonId'],
      where: { pipelineId, stage: { type: 'lost' }, ...dateFilter },
      _count: true,
    }),

    // Total budget
    prisma.deal.aggregate({
      where: { pipelineId, ...dateFilter },
      _sum: { budget: true },
    }),

    // By assignee
    prisma.deal.groupBy({
      by: ['assigneeId'],
      where: { pipelineId, ...dateFilter },
      _count: true,
      _sum: { budget: true },
    }),

    // Monthly dynamics (raw query)
    prisma.$queryRaw<Array<{ month: string; count: bigint; budget: number }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
        COUNT(*)::bigint as count,
        COALESCE(SUM(budget), 0) as budget
      FROM "Deal"
      WHERE "pipelineId" = ${pipelineId} AND "deletedAt" IS NULL
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `,

    // Пробные уроки: записаны (кроме отменённых) / состоялись / no-show
    prisma.trialLesson.count({ where: { ...trialWhere, status: { not: 'canceled' } } }),
    prisma.trialLesson.count({ where: { ...trialWhere, status: 'completed' } }),
    prisma.trialLesson.count({ where: { ...trialWhere, status: 'no_show' } }),

    // Воронка по этапам — счётчик УВАЖАЕТ dateFilter (в отличие от stages[]._count.deals ниже,
    // который остаётся как есть ради бар-чарта «Сделки по этапам»)
    prisma.deal.groupBy({ by: ['stageId'], where: { pipelineId, ...dateFilter }, _count: true }),

    // Конверсия пробный → оплата: сделки с завершённым пробным за период
    prisma.trialLesson.findMany({
      where: { ...trialWhere, status: 'completed' },
      select: { dealId: true },
      distinct: ['dealId'],
    }),

    // Источники (UTM): объём и конверсия по custom_fields.utm_source (пишется только лид-формой, A6)
    prisma.$queryRaw<Array<{ source: string; count: bigint; won: bigint; revenue: number }>>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(d.custom_fields->>'utm_source', ''), 'Без источника') as source,
        COUNT(*)::bigint as count,
        COUNT(*) FILTER (WHERE st.type = 'won')::bigint as won,
        COALESCE(SUM(d.budget) FILTER (WHERE st.type = 'won'), 0) as revenue
      FROM "Deal" d
      JOIN "Stage" st ON st.id = d."stageId"
      WHERE d."pipelineId" = ${pipelineId} AND d."deletedAt" IS NULL ${utmDateCondition}
      GROUP BY 1
      ORDER BY count DESC
    `),

    // Retention (renewal/LTV/churn): все подписки контактов, у которых есть сделка в этом пайплайне.
    // НЕ фильтруются по dateFilter — это метрики жизненного цикла ученика, а не сделок за период.
    prisma.subscription.findMany({
      where: { contact: { deals: { some: { pipelineId, deletedAt: null } } } },
      select: { contactId: true, status: true, expiresAt: true, price: true },
    }),
  ])

  // Enrich assignee data
  const assigneeIds = byAssignee.map(a => a.assigneeId).filter(Boolean) as string[]
  const users = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, name: true },
  })
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]))

  // Enrich lost reasons
  const reasonIds = lostByReason.map(r => r.lostReasonId).filter(Boolean) as string[]
  const reasons = reasonIds.length
    ? await prisma.lostReason.findMany({ where: { id: { in: reasonIds } }, select: { id: true, name: true } })
    : []
  const reasonMap = Object.fromEntries(reasons.map(r => [r.id, r.name]))

  const stagesData = stages.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
    dealsCount: s._count.deals,
    totalBudget: s.deals.reduce((sum, d) => sum + Number(d.budget ?? 0), 0),
  }))

  // Пробный → оплата: среди сделок с завершённым пробным — у скольких есть Subscription
  // (а не Payment.status='succeeded' — ручные оплаты наличными/переводом тоже создают Subscription,
  // но не создают Payment, так что Payment занижал бы конверсию)
  const completedTrialDealIds = completedTrialDeals.map(t => t.dealId)
  const paidDeals = completedTrialDealIds.length
    ? await prisma.subscription.findMany({
        where: { dealId: { in: completedTrialDealIds } },
        select: { dealId: true },
        distinct: ['dealId'],
      })
    : []
  const trialToPaymentRate =
    completedTrialDealIds.length > 0
      ? ((paidDeals.length / completedTrialDealIds.length) * 100).toFixed(1)
      : null

  // Воронка по этапам — по ТЕКУЩЕМУ положению сделки, без парсинга истории Activity.
  // Lost исключены (неизвестно, докуда дошли до отказа — уже отдельно видно через winRate/lostReasons).
  const stageCountMap = Object.fromEntries(stageCounts.map(s => [s.stageId, s._count]))
  const funnelStages = stages.filter(s => s.type !== 'lost') // уже отсортированы по order asc
  const funnel = funnelStages.map((s, i) => {
    const cumulativeCount = funnelStages
      .slice(i)
      .reduce((sum, later) => sum + (stageCountMap[later.id] ?? 0), 0)
    return { id: s.id, name: s.name, order: s.order, type: s.type, count: stageCountMap[s.id] ?? 0, cumulativeCount }
  })
  const firstCumulative = funnel[0]?.cumulativeCount ?? 0
  const funnelData = funnel.map((f, i) => ({
    ...f,
    conversionFromFirst: firstCumulative > 0 ? Number(((f.cumulativeCount / firstCumulative) * 100).toFixed(1)) : null,
    conversionFromPrevious:
      i === 0
        ? 100
        : funnel[i - 1].cumulativeCount > 0
          ? Number(((f.cumulativeCount / funnel[i - 1].cumulativeCount) * 100).toFixed(1))
          : null,
  }))

  const utmSources = utmSourcesRaw.map(r => ({
    source: r.source,
    count: Number(r.count),
    won: Number(r.won),
    revenue: Number(r.revenue),
    conversionRate: Number(r.count) > 0 ? Number(((Number(r.won) / Number(r.count)) * 100).toFixed(1)) : null,
  }))

  // Retention: LTV — средняя сумма всех подписок на ученика; renewal/churn — среди учеников,
  // у которых хотя бы одна подписка ЗАВЕРШИЛАСЬ естественно (exhausted/истёк срок), доля тех,
  // кто купил ещё одну. Упрощение: не проверяем порядок подписок во времени — наличие 2+
  // подписок у ученика с хотя бы одной завершённой считается продлением.
  const now = new Date()
  const byContact = new Map<string, { totalPrice: number; count: number; finished: boolean }>()
  for (const s of pipelineSubscriptions) {
    const entry = byContact.get(s.contactId) ?? { totalPrice: 0, count: 0, finished: false }
    entry.totalPrice += Number(s.price)
    entry.count += 1
    if (s.status === 'exhausted' || (s.status === 'active' && s.expiresAt !== null && s.expiresAt < now)) {
      entry.finished = true
    }
    byContact.set(s.contactId, entry)
  }
  const payingContacts = [...byContact.values()]
  const finishedContacts = payingContacts.filter(c => c.finished)
  const renewedContacts = finishedContacts.filter(c => c.count >= 2)
  const renewalRate = finishedContacts.length > 0 ? (renewedContacts.length / finishedContacts.length) * 100 : null
  const retention = {
    payingContacts: payingContacts.length,
    ltv: payingContacts.length > 0 ? Math.round(payingContacts.reduce((sum, c) => sum + c.totalPrice, 0) / payingContacts.length) : null,
    renewalRate: renewalRate != null ? renewalRate.toFixed(1) : null,
    churnRate: renewalRate != null ? (100 - renewalRate).toFixed(1) : null,
  }

  const payload = {
    pipeline: { id: pipelineId },
    summary: {
      totalDeals,
      closedDeals: wonDeals, // алиас для обратной совместимости фронта
      wonDeals,
      lostDeals,
      // Win rate — доля выигранных среди закрытых; знаменатель только завершённые исходы
      winRate: wonDeals + lostDeals > 0 ? ((wonDeals / (wonDeals + lostDeals)) * 100).toFixed(1) : null,
      conversionRate: totalDeals > 0 ? ((wonDeals / totalDeals) * 100).toFixed(1) : '0',
      totalBudget: Number(totalBudget._sum.budget ?? 0),
      trials: {
        booked: trialsBooked,
        completed: trialsCompleted,
        noShow: trialsNoShow,
        // Знаменатель — только состоявшиеся исходы; будущие уроки не портят метрику
        showRate:
          trialsCompleted + trialsNoShow > 0
            ? ((trialsCompleted / (trialsCompleted + trialsNoShow)) * 100).toFixed(1)
            : null,
        trialToPaymentRate,
      },
      retention,
    },
    stages: stagesData,
    funnel: funnelData,
    utmSources,
    lostReasons: lostByReason
      .map(r => ({
        id: r.lostReasonId,
        name: r.lostReasonId ? (reasonMap[r.lostReasonId] ?? 'Неизвестная причина') : 'Без причины',
        count: r._count,
      }))
      .sort((a, b) => b.count - a.count),
    byAssignee: byAssignee.map(a => ({
      assigneeId: a.assigneeId,
      name: a.assigneeId ? (userMap[a.assigneeId] ?? 'Unknown') : 'Не назначен',
      count: a._count,
      budget: Number(a._sum.budget ?? 0),
    })),
    monthly: byMonth.map(m => ({
      month: m.month,
      count: Number(m.count),
      budget: Number(m.budget),
    })),
  }

  cacheSet(cacheKey, JSON.stringify(payload), 300)
  return res.json(payload)
})

router.get('/tasks/summary', async (req, res) => {
  const { assigneeId } = req.query
  const where = assigneeId ? { assigneeId: assigneeId as string } : {}

  const [total, completed, overdue] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.count({ where: { ...where, completed: true } }),
    prisma.task.count({ where: { ...where, completed: false, dueDate: { lt: new Date() } } }),
  ])

  return res.json({ total, completed, overdue, pending: total - completed })
})

export default router
