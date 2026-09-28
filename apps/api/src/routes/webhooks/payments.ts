import { Router, type Request, type Response } from 'express'
import { prisma } from '../../lib/prisma'
import { getProvider, getPaymentSettings, formatAmount } from '../../services/payments'
import { createSubscription } from '../../services/subscriptions'
import { applyStageMove } from '../../services/deals/move-stage'
import { triggerAutomation } from '../../services/automation/engine'
import { emitToRoom } from '../../socket/handlers'
import type { Prisma } from '@prisma/client'

const router = Router()

interface RawBodyRequest extends Request {
  rawBody?: Buffer
}

function sendAck(res: Response, ack: { status: number; contentType: string; body: string }) {
  return res.status(ack.status).type(ack.contentType).send(ack.body)
}

async function handleProviderWebhook(providerName: string, req: RawBodyRequest, res: Response) {
  const provider = getProvider(providerName)
  if (!provider) return res.status(404).json({ error: 'Unknown provider' })
  if (!req.rawBody) return res.status(400).json({ error: 'Empty body' })

  const result = await provider.handleWebhook(req.rawBody, req.headers)
  if (!result.ok) {
    console.warn(`[payments:${providerName}] Отклонён вебхук: ${result.reason}`)
    return sendAck(res, result.nack)
  }

  const payment = await prisma.payment.findUnique({ where: { invoiceId: result.invoiceId } })
  if (!payment) {
    // Ack, а не 404 — иначе провайдер будет вечно ретраить чужой/тестовый платёж
    console.warn(`[payments:${providerName}] Платёж invoiceId=${result.invoiceId} не найден — ack без эффектов`)
    return sendAck(res, result.ack)
  }

  // Сумма сверяется мягко: деньги уже списаны, блокировать поздно — только лог для разбора
  if (result.amount != null && Number(result.amount).toFixed(2) !== formatAmount(payment.amount)) {
    console.warn(
      `[payments:${providerName}] Расхождение суммы invoiceId=${result.invoiceId}: ожидали ${formatAmount(payment.amount)}, пришло ${result.amount}`
    )
  }

  // Идемпотентность + гонка: только pending → succeeded; повторный вебхук/отменённый счёт = ack без эффектов
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'pending' },
    data: {
      status: 'succeeded',
      paidAt: new Date(),
      externalId: result.externalId,
      rawWebhook: JSON.parse(JSON.stringify({ headers: { 'content-type': req.headers['content-type'] }, body: req.rawBody.toString('utf8') })) as Prisma.InputJsonValue,
    },
  })
  if (updated.count === 0) {
    if (payment.status === 'canceled') {
      console.warn(`[payments:${providerName}] Оплата по ОТМЕНЁННОМУ счёту invoiceId=${result.invoiceId} — нужен ручной разбор`)
    }
    return sendAck(res, result.ack)
  }

  // Побочные эффекты после успешного перехода — каждый в своём try/catch,
  // чтобы сбой одного не оставил провайдера без ack (он бы ретраил, а статус уже succeeded)
  try {
    if (payment.contactId) {
      const subscription = await createSubscription({
        contactId: payment.contactId,
        dealId: payment.dealId,
        packageId: payment.packageId,
        packageName: payment.packageName,
        lessonsTotal: payment.lessonsTotal,
        price: Number(payment.amount),
        expiresAt: payment.durationDays ? new Date(Date.now() + payment.durationDays * 86400_000) : null,
        paymentId: payment.id,
      })
      console.log(`[payments:${providerName}] Подписка ${subscription.id} создана по платежу ${payment.id}`)
    }
  } catch (err) {
    console.error(`[payments:${providerName}] Ошибка создания подписки по платежу ${payment.id}:`, err)
  }

  try {
    if (payment.dealId) {
      await prisma.activity.create({
        data: {
          dealId: payment.dealId,
          type: 'payment_received',
          payload: {
            paymentId: payment.id,
            provider: providerName,
            amount: formatAmount(payment.amount),
            packageName: payment.packageName,
          },
        },
      })

      const deal = await prisma.deal.findUnique({ where: { id: payment.dealId }, include: { stage: true } })
      if (deal) {
        const payload = { dealId: deal.id, paymentId: payment.id, amount: formatAmount(payment.amount) }
        emitToRoom(`deal:${deal.id}`, 'PAYMENT_RECEIVED', payload)
        emitToRoom(`pipeline:${deal.pipelineId}`, 'PAYMENT_RECEIVED', payload)

        triggerAutomation({
          type: 'payment_received',
          deal,
          stageId: deal.stageId,
          payload: { paymentId: payment.id, amount: formatAmount(payment.amount) },
        }).catch(console.error)

        // Автоперенос в «Оплачено»: настроенный этап воронки → первый won-этап.
        // Если сделка уже в won-этапе (менеджер успел руками) — не трогаем.
        if (deal.stage.type !== 'won') {
          const settings = await getPaymentSettings()
          let targetStageId = settings.config.paidStageMap?.[deal.pipelineId] ?? null
          if (!targetStageId) {
            const wonStage = await prisma.stage.findFirst({
              where: { pipelineId: deal.pipelineId, type: 'won' },
              orderBy: { order: 'asc' },
            })
            targetStageId = wonStage?.id ?? null
          }
          if (targetStageId && targetStageId !== deal.stageId) {
            await applyStageMove(deal.id, targetStageId, { activityType: 'stage_change' })
          }
        }
      }
    }
  } catch (err) {
    console.error(`[payments:${providerName}] Ошибка пост-обработки платежа ${payment.id}:`, err)
  }

  return sendAck(res, result.ack)
}

router.post('/cloudpayments', (req: RawBodyRequest, res, next) =>
  handleProviderWebhook('cloudpayments', req, res).catch(next)
)
router.post('/robokassa', (req: RawBodyRequest, res, next) =>
  handleProviderWebhook('robokassa', req, res).catch(next)
)

export default router
