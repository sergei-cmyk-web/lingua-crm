import { Router } from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'
import { triggerAutomation } from '../../services/automation/engine'
import { phoneCanonical } from '../../lib/phone'
import { dealInclude } from '../deals'

const router = Router()

// Публичный endpoint для форм на лендингах: глобальный CORS-allowlist
// зарезал бы preflight с сайта школы — на этом роутере разрешаем все origin.
// Доступ защищён секретным ключом формы + rate limit.
router.use(cors({ origin: true }))

const leadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
})

const leadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(5).max(30),
  email: z.string().email().max(200).optional().or(z.literal('')),
  language: z.string().max(100).optional(),
  comment: z.string().max(2000).optional(),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  form_key: z.string().max(200).optional(),
  // Honeypot: скрытое CSS-полем поле в форме лендинга, реальный пользователь его не видит и не
  // заполняет. Простые боты, заполняющие все поля формы, попадаются здесь без похода к CAPTCHA.
  // ponytail: не защищает от целевого/headless-бота, читающего разметку — если спам пойдёт и
  // после этого, следующий шаг — hCaptcha/Turnstile (нужен внешний сервис + site key).
  website: z.string().max(200).optional(),
})

interface LeadFormConfig {
  secret?: string
  pipelineId?: string
  stageId?: string
}

router.post('/', leadLimiter, async (req, res, next) => {
  try {
    const parsed = leadSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten().fieldErrors })
    }
    const data = parsed.data

    // Honeypot tripped — вернуть успех молча, чтобы не выдавать боту, что его отфильтровали.
    if (data.website) return res.status(201).json({ ok: true })

    const settingRaw = await prisma.integrationSetting.findUnique({ where: { key: 'lead_form' } })
    const config: LeadFormConfig = settingRaw ? JSON.parse(settingRaw.value) : {}
    if (!config.secret || !config.pipelineId || !config.stageId) {
      return res.status(503).json({ error: 'Форма захвата лидов не настроена' })
    }

    const provided = Buffer.from(req.header('x-form-key') ?? data.form_key ?? '')
    const expected = Buffer.from(config.secret)
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Неверный ключ формы' })
    }

    const stage = await prisma.stage.findUnique({ where: { id: config.stageId } })
    if (!stage || stage.pipelineId !== config.pipelineId) {
      console.error('[leads] lead_form указывает на несуществующий этап/воронку')
      return res.status(503).json({ error: 'Форма захвата лидов не настроена' })
    }

    const phone = phoneCanonical(data.phone)
    if (!phone) return res.status(400).json({ error: 'Некорректный телефон' })

    // Поиск и по основному телефону, и по дополнительным
    let contact = await prisma.contact.findFirst({
      where: { deletedAt: null, OR: [{ phone }, { phones: { some: { phone } } }] },
    })
    const isRepeat = !!contact
    if (!contact) {
      contact = await prisma.contact.create({
        data: { name: data.name, phone, email: data.email || null },
      })
    } else if (!contact.email && data.email) {
      contact = await prisma.contact.update({ where: { id: contact.id }, data: { email: data.email } })
    }

    const customFields: Record<string, unknown> = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
      if (data[key]) customFields[key] = data[key]
    }
    if (data.language) customFields.language = data.language
    if (data.comment) customFields.lead_comment = data.comment

    const deal = await prisma.deal.create({
      data: {
        title: `Заявка с сайта — ${data.name}`,
        pipelineId: config.pipelineId,
        stageId: config.stageId,
        contactId: contact.id,
        custom_fields: customFields as Prisma.InputJsonValue,
      },
      include: dealInclude,
    })

    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: 'lead_captured',
        payload: { ...customFields, repeat: isRepeat },
      },
    })

    // Автоответ клиенту — существующей автоматизацией stage_enter → send_wazzup_message
    triggerAutomation({ type: 'stage_enter', deal, stageId: deal.stageId }).catch(console.error)
    emitToRoom(`pipeline:${deal.pipelineId}`, 'DEAL_CREATED', deal)

    // Внутренние id наружу не отдаём
    return res.status(201).json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
