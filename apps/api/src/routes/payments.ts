import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { getProvider, getPaymentSettings, formatAmount, PAYMENT_PROVIDERS } from '../services/payments'

const router = Router()
router.use(authMiddleware)

// Выставление/отмена счетов — admin+manager, не teacher.
const financeRole = requirePermission('finance.manage')

const createSchema = z.object({
  dealId: z.string().min(1),
  packageId: z.string().min(1),
  provider: z.enum(PAYMENT_PROVIDERS).optional(),
  amount: z.number().positive().optional(), // override цены пакета
  lessonsTotal: z.number().int().positive().optional(), // override уроков
})

// «Выставить счёт»: Payment (pending) → ссылка провайдера → paymentUrl.
// Внешний HTTP провайдера ждём в запросе (это не BullMQ, таймаут 10с);
// при ошибке провайдера платёж помечается failed и клиент получает 502.
router.post('/', financeRole, validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const { dealId, packageId, provider: providerName, amount, lessonsTotal } = req.body

    const [deal, pkg, settings] = await Promise.all([
      prisma.deal.findUnique({ where: { id: dealId }, include: { contact: true } }),
      prisma.package.findUnique({ where: { id: packageId } }),
      getPaymentSettings(),
    ])
    if (!deal) return res.status(404).json({ error: 'Deal not found' })
    if (!pkg) return res.status(404).json({ error: 'Package not found' })
    if (!deal.contact) return res.status(400).json({ error: 'no_contact', message: 'У сделки нет контакта — счёт выставляется клиенту' })

    const resolvedName = providerName ?? settings.config.defaultProvider
    const provider = resolvedName ? getProvider(resolvedName) : null
    if (!provider) {
      return res.status(400).json({ error: 'no_provider', message: 'Платёжный провайдер не настроен — укажите его в Настройки → Оплата' })
    }

    const payment = await prisma.payment.create({
      data: {
        dealId,
        contactId: deal.contact.id,
        packageId,
        packageName: pkg.name,
        lessonsTotal: lessonsTotal ?? pkg.lessonsCount,
        durationDays: pkg.durationDays,
        amount: amount ?? pkg.price,
        provider: provider.name,
        createdById: req.user!.id,
      },
    })

    let url: string
    try {
      const result = await provider.createLink({
        payment: {
          id: payment.id,
          invoiceId: payment.invoiceId,
          amount: formatAmount(payment.amount),
          currency: payment.currency,
        },
        description: `${pkg.name} — LinguaCRM`,
        email: deal.contact.email,
        phone: deal.contact.phone,
      })
      url = result.url
    } catch (err) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } })
      const message = err instanceof Error ? err.message : 'Ошибка платёжного провайдера'
      return res.status(502).json({ error: 'provider_error', message })
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { paymentUrl: url },
    })

    await prisma.activity.create({
      data: {
        dealId,
        userId: req.user!.id,
        type: 'invoice_created',
        payload: {
          paymentId: payment.id,
          provider: provider.name,
          amount: formatAmount(payment.amount),
          packageName: pkg.name,
        },
      },
    })

    return res.status(201).json(updated)
  } catch (err) {
    return next(err)
  }
})

router.get('/', async (req, res) => {
  const { dealId, contactId } = req.query
  if (!dealId && !contactId) return res.status(400).json({ error: 'dealId or contactId required' })

  const payments = await prisma.payment.findMany({
    where: {
      ...(dealId ? { dealId: dealId as string } : {}),
      ...(contactId ? { contactId: contactId as string } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  return res.json(payments)
})

router.post('/:id/cancel', financeRole, async (req: AuthRequest, res, next) => {
  try {
    // Только pending: succeeded терминален, отменённый вебхуком не воскресает
    const result = await prisma.payment.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: { status: 'canceled' },
    })
    if (result.count === 0) {
      return res.status(409).json({ error: 'not_pending', message: 'Счёт уже оплачен или отменён' })
    }
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } })
    if (payment?.dealId) {
      await prisma.activity.create({
        data: {
          dealId: payment.dealId,
          userId: req.user!.id,
          type: 'invoice_canceled',
          payload: { paymentId: payment.id },
        },
      })
    }
    return res.json(payment)
  } catch (err) {
    return next(err)
  }
})

export default router
