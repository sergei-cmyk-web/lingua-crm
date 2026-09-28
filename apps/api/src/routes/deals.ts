import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { stringify } from 'csv-stringify'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { emitToRoom } from '../socket/handlers'
import { triggerAutomation } from '../services/automation/engine'
import { wazzupClient } from '../services/wazzup/client'
import { resolveRecipient, sendMessageToContact } from '../services/messaging/sendToContact'
import { phoneDigits } from '../lib/phone'
import { emitTrialUpdated } from './trials'
import { emailClient } from '../services/email/client'
import { uploadObject, isStorageConfigured } from '../services/storage/s3'
import { canAccessAccount } from '../services/email/access'
import { buildExportColumns, buildDealExportRow } from '../services/export/deals'
import { parsePagination } from '../lib/pagination'

const uploadEmailAttachments = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })

const router = Router()
router.use(authMiddleware)

export const dealInclude = {
  stage: true,
  assignee: { select: { id: true, name: true, email: true } },
  contact: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      telegramUsername: true,
      wazzupChatId: true,
      wazzupChannel: true,
      deletedAt: true,
      phones: { select: { id: true, phone: true, label: true }, orderBy: { createdAt: 'asc' as const } },
      emails: { select: { id: true, email: true, label: true }, orderBy: { createdAt: 'asc' as const } },
      channels: { select: { id: true, transport: true, chatId: true } },
    },
  },
  company: { select: { id: true, name: true } },
  lostReason: { select: { id: true, name: true } },
  trials: { orderBy: { scheduledAt: 'desc' as const } },
  _count: { select: { tasks: true, messages: true, calls: true } },
}

router.get('/', async (req, res) => {
  const { pipelineId, stageId, assigneeId, search, tags } = req.query
  const { page, limit, skip } = parsePagination(req.query)

  const where: Record<string, unknown> = { deletedAt: null }
  if (pipelineId) where.pipelineId = pipelineId
  if (stageId) where.stageId = stageId
  if (assigneeId) where.assigneeId = assigneeId
  if (search) where.title = { contains: search as string, mode: 'insensitive' }
  if (tags) where.tags = { hasSome: (tags as string).split(',').filter(Boolean) }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: dealInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ])

  return res.json({ deals, total, page, limit })
})

router.get('/export', requirePermission('deals.export'), async (req, res, next) => {
 try {
  const { pipelineId, stageId, assigneeId, search, ids, format = 'csv' } = req.query
  if (format !== 'csv' && format !== 'xlsx') {
    return res.status(400).json({ error: 'invalid_format' })
  }

  const where: Record<string, unknown> = { deletedAt: null }
  // Экспорт выбранных чекбоксами строк — остальные фильтры в этом случае игнорируются
  if (ids && typeof ids === 'string') {
    where.id = { in: ids.split(',').filter(Boolean) }
  } else {
    if (pipelineId) where.pipelineId = pipelineId
    if (stageId) where.stageId = stageId
    if (assigneeId) where.assigneeId = assigneeId
    if (search) where.title = { contains: search as string, mode: 'insensitive' }
  }

  const [dealFields, contactFields] = await Promise.all([
    prisma.fieldDefinition.findMany({ where: { entityType: 'deal' }, orderBy: { order: 'asc' } }),
    prisma.fieldDefinition.findMany({ where: { entityType: 'contact' }, orderBy: { order: 'asc' } }),
  ])

  const columns = buildExportColumns(dealFields, contactFields)
  const filename = `deals-export-${new Date().toISOString().slice(0, 10)}`

  // Курсор-батчи вместо findMany всех сделок разом — 100k строк не должны попасть в память
  // целиком (иначе OOM на xlsx). ponytail: BATCH=500; больше — если I/O БД станет узким местом.
  const BATCH = 500
  async function* dealBatches() {
    let cursor: string | undefined
    for (;;) {
      const batch = await prisma.deal.findMany({
        where,
        include: {
          ...dealInclude,
          pipeline: { select: { name: true } },
          contact: { select: { ...dealInclude.contact.select, custom_fields: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      if (batch.length === 0) return
      yield batch
      if (batch.length < BATCH) return
      cursor = batch[batch.length - 1].id
    }
  }

  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false })
    const sheet = workbook.addWorksheet('Сделки')
    sheet.columns = columns.map(label => ({ header: label, key: label, width: 22 }))
    for await (const batch of dealBatches()) {
      for (const d of batch) sheet.addRow(buildDealExportRow(d, dealFields, contactFields)).commit()
    }
    await workbook.commit()
    return
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
  const stringifier = stringify({ header: true, columns, bom: true })
  stringifier.pipe(res)
  for await (const batch of dealBatches()) {
    for (const d of batch) {
      // Уважаем backpressure: если буфер stringifier полон — ждём drain, иначе память растёт на медленном клиенте
      if (!stringifier.write(buildDealExportRow(d, dealFields, contactFields))) {
        await new Promise(resolve => stringifier.once('drain', resolve))
      }
    }
  }
  stringifier.end()
  return
 } catch (err) {
   // Заголовки уже ушли (стрим начался) — корректно ответить нельзя, рвём соединение; иначе обычный 500
   if (res.headersSent) return res.destroy()
   return next(err)
 }
})

// Список всех тегов, реально использованных в недалённых сделках — для автокомплита/фильтра
router.get('/tags', async (_req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM "Deal" WHERE "deletedAt" IS NULL ORDER BY tag
  `
  return res.json(rows.map(r => r.tag))
})

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1) })

// Мягкое удаление нескольких сделок разом (выбор чекбоксами в списке/канбане)
router.post('/bulk-delete', requirePermission('trash.manage'), validate(bulkDeleteSchema), async (req: AuthRequest, res, next) => {
  try {
    const { ids } = req.body as { ids: string[] }
    const deals = await prisma.deal.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, pipelineId: true },
    })
    if (deals.length === 0) return res.json({ deleted: 0 })

    await prisma.deal.updateMany({ where: { id: { in: deals.map(d => d.id) } }, data: { deletedAt: new Date() } })
    await prisma.activity.createMany({
      data: deals.map(d => ({ dealId: d.id, userId: req.user!.id, type: 'deal_deleted' as const, payload: { title: d.title } })),
    })

    for (const d of deals) {
      emitToRoom(`pipeline:${d.pipelineId}`, 'DEAL_DELETED', { id: d.id })
    }

    return res.json({ deleted: deals.length })
  } catch (err) {
    return next(err)
  }
})

// Канбан грузит только N свежих карточек на этап + общий счётчик — иначе этап с тысячами сделок
// вешает и запрос, и DOM (@dnd-kit рендерит всё). Overflow уходит в пагинированный список /deals.
// ponytail: фикс. take/этап; per-column infinite scroll — если понадобится drag за пределами свежих 100.
const KANBAN_DEALS_PER_STAGE = 100

router.get('/kanban/:pipelineId', async (req, res) => {
  const stages = await prisma.stage.findMany({
    where: { pipelineId: req.params.pipelineId },
    orderBy: { order: 'asc' },
    include: {
      deals: {
        where: { deletedAt: null },
        include: dealInclude,
        orderBy: { createdAt: 'desc' },
        take: KANBAN_DEALS_PER_STAGE,
      },
      _count: { select: { deals: { where: { deletedAt: null } } } },
    },
  })
  // totalDeals — реальное число сделок этапа (для «показано X из Y» и overflow-ссылки)
  return res.json(stages.map(s => ({ ...s, totalDeals: s._count.deals })))
})

router.get('/:id', async (req, res) => {
  const deal = await prisma.deal.findUnique({
    where: { id: req.params.id },
    include: {
      ...dealInclude,
      tasks: {
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      messages: { orderBy: { createdAt: 'desc' }, take: 30 },
      calls: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!deal) return res.status(404).json({ error: 'Deal not found' })
  return res.json(deal)
})

const createSchema = z.object({
  title: z.string().min(1),
  budget: z.number().optional(),
  stageId: z.string(),
  pipelineId: z.string(),
  assigneeId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
})

router.post('/', requirePermission('entities.edit'), validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const deal = await prisma.deal.create({
      data: req.body,
      include: dealInclude,
    })

    await prisma.activity.create({
      data: { dealId: deal.id, userId: req.user!.id, type: 'deal_created', payload: { title: deal.title } },
    })

    triggerAutomation({ type: 'stage_enter', deal, stageId: deal.stageId }).catch(console.error)
    emitToRoom(`pipeline:${deal.pipelineId}`, 'DEAL_CREATED', deal)

    return res.status(201).json(deal)
  } catch (err) {
    return next(err)
  }
})

// Только скалярные поля из тела. stageId/pipelineId/closedAt/lostReasonId/lostComment/deletedAt/
// stageEnteredAt намеренно исключены — они меняются через PATCH /:id/stage (бизнес-логика причин
// потери и обязательных полей) и DELETE /:id (admin-only soft-delete); .strict() отклоняет и любые
// вложенные relation-writes вроде {"activities":{"deleteMany":{}}}.
const patchSchema = z
  .object({
    title: z.string().min(1).optional(),
    budget: z.number().optional(),
    assigneeId: z.string().optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    custom_fields: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()

router.patch('/:id', requirePermission('entities.edit'), validate(patchSchema), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Deal not found' })

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: req.body,
      include: dealInclude,
    })

    await prisma.activity.create({
      data: { dealId: deal.id, userId: req.user!.id, type: 'deal_updated', payload: req.body },
    })

    if (req.body.custom_fields) {
      for (const [key, value] of Object.entries(req.body.custom_fields)) {
        triggerAutomation({ type: 'field_change', deal, fieldKey: key, fieldValue: value }).catch(console.error)
      }
    }

    emitToRoom(`pipeline:${deal.pipelineId}`, 'DEAL_UPDATED', deal)
    return res.json(deal)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id/stage', requirePermission('entities.edit'), async (req: AuthRequest, res, next) => {
  try {
    const { stageId, lostReasonId, lostComment } = req.body
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Deal not found' })

    const newStage = await prisma.stage.findUnique({ where: { id: stageId } })
    if (!newStage) return res.status(404).json({ error: 'Stage not found' })

    // Перенос в lost-этап требует причину (симметрично 422 required_fields — фронт различает по error)
    if (newStage.type === 'lost') {
      if (!lostReasonId) {
        return res.status(422).json({ error: 'lost_reason_required' })
      }
      const reason = await prisma.lostReason.findUnique({ where: { id: lostReasonId } })
      if (!reason || !reason.active) {
        return res.status(400).json({ error: 'Lost reason not found or inactive' })
      }
    }

    // Validate required-at-stage fields (any field that lists this stageId)
    const stageRequiredFields = await prisma.fieldDefinition.findMany({
      where: { entityType: 'deal', requiredAtStageIds: { has: stageId } },
    })
    if (stageRequiredFields.length > 0) {
      const customFields = (existing.custom_fields ?? {}) as Record<string, unknown>
      const emptyFields = stageRequiredFields.filter(f => {
        const val = customFields[f.key]
        return val === null || val === undefined || val === ''
      })
      if (emptyFields.length > 0) {
        return res.status(422).json({
          error: 'required_fields',
          fields: emptyFields.map(f => ({ id: f.id, key: f.key, label: f.label })),
        })
      }
    }

    const prevStageId = existing.stageId
    const prevPipelineId = existing.pipelineId

    // won/lost фиксируют closedAt; возврат в open очищает и его, и причину потери
    const closureData =
      newStage.type === 'lost'
        ? { lostReasonId, lostComment: lostComment ?? null, closedAt: new Date() }
        : newStage.type === 'won'
          ? { lostReasonId: null, lostComment: null, closedAt: new Date() }
          : { lostReasonId: null, lostComment: null, closedAt: null }

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: { stageId, pipelineId: newStage.pipelineId, stageEnteredAt: new Date(), ...closureData },
      include: dealInclude,
    })

    await prisma.activity.create({
      data: {
        dealId: deal.id,
        userId: req.user!.id,
        type: 'stage_change',
        payload: {
          from: prevStageId,
          to: stageId,
          ...(newStage.type === 'lost' ? { lostReasonId, lostComment: lostComment ?? null } : {}),
        },
      },
    })

    triggerAutomation({ type: 'stage_leave', deal: { ...deal, stageId: prevStageId }, stageId: prevStageId }).catch(console.error)
    triggerAutomation({ type: 'stage_enter', deal, stageId }).catch(console.error)

    emitToRoom(`pipeline:${prevPipelineId}`, 'DEAL_MOVED', { deal, prevStageId, newStageId: stageId })
    if (newStage.pipelineId !== prevPipelineId) {
      emitToRoom(`pipeline:${newStage.pipelineId}`, 'DEAL_MOVED', { deal, prevStageId, newStageId: stageId })
    }
    return res.json(deal)
  } catch (err) {
    return next(err)
  }
})

// Мягкое удаление: сделка уходит в корзину, навсегда стирается через 30 дней (routes/trash.ts)
router.delete('/:id', requirePermission('trash.manage'), async (req: AuthRequest, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } })
    if (!deal) return res.status(404).json({ error: 'Deal not found' })

    await prisma.deal.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } })
    await prisma.activity.create({
      data: { dealId: deal.id, userId: req.user!.id, type: 'deal_deleted', payload: { title: deal.title } },
    })
    emitToRoom(`pipeline:${deal.pipelineId}`, 'DEAL_DELETED', { id: req.params.id })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

const trialTargetSchema = z.object({
  transport: z.string().min(1),
  chatId: z.string().min(1),
})

const createTrialSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    reminderTargets: z.array(trialTargetSchema).min(1).optional(),
    // legacy-форма: один канал, chatId резолвится на сервере
    reminderTransport: z.string().min(1).optional(),
    reminderChatId: z.string().optional(),
  })
  .refine(d => (d.reminderTargets?.length ?? 0) > 0 || d.reminderTransport, {
    message: 'Укажите каналы напоминаний (reminderTargets)',
  })

router.post('/:id/trials', validate(createTrialSchema), async (req: AuthRequest, res, next) => {
  try {
    const { scheduledAt: scheduledAtRaw, reminderTargets, reminderTransport, reminderChatId: explicitChatId } = req.body
    const scheduledAt = new Date(scheduledAtRaw)
    if (scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Время урока должно быть в будущем' })
    }

    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { contact: { include: { channels: true } } },
    })
    if (!deal) return res.status(404).json({ error: 'Deal not found' })

    const active = await prisma.trialLesson.findFirst({ where: { dealId: deal.id, status: 'scheduled' } })
    if (active) return res.status(409).json({ error: 'У сделки уже есть запланированный пробный урок' })

    const contact = deal.contact
    let targets: Array<{ transport: string; chatId: string }> = reminderTargets ?? []
    if (targets.length === 0 && reminderTransport) {
      const resolvedChatId: string | null =
        explicitChatId ??
        (reminderTransport === 'sms'
          ? contact?.phone
            ? phoneDigits(contact.phone)
            : null
          : contact?.channels?.find((c: { transport: string }) => c.transport === reminderTransport)?.chatId ??
            contact?.wazzupChatId ??
            (contact?.phone ? phoneDigits(contact.phone) : null))
      if (resolvedChatId) targets = [{ transport: reminderTransport, chatId: resolvedChatId }]
    }
    if (targets.length === 0) {
      return res.status(400).json({ error: 'Не удалось определить получателя напоминаний — заполните телефон или каналы контакта' })
    }

    const trial = await prisma.trialLesson.create({
      data: {
        dealId: deal.id,
        scheduledAt,
        reminderTransport: targets[0].transport,
        reminderChatId: targets[0].chatId,
        reminderTargets: targets,
        createdById: req.user!.id,
      },
    })

    await prisma.activity.create({
      data: {
        dealId: deal.id,
        userId: req.user!.id,
        type: 'trial_booked',
        payload: { scheduledAt: scheduledAt.toISOString(), transports: targets.map(t => t.transport) },
      },
    })

    // Очереди BullMQ — вне критического пути запроса (замечание 7): при недоступном
    // Redis ответ не должен зависнуть; пропущенное планирование догонит sweep из Postgres.
    import('../services/trial-reminders/worker')
      .then(({ scheduleTrialReminders }) => scheduleTrialReminders(trial))
      .catch(err => console.error('[trials] не удалось запланировать напоминания:', err))

    triggerAutomation({ type: 'trial_booked', deal, stageId: deal.stageId }).catch(console.error)
    emitTrialUpdated(deal.pipelineId, deal.id, trial)

    return res.status(201).json(trial)
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const { text, transport, chatId: explicitChatId, recipientType: explicitRecipientType, scheduledAt: scheduledAtRaw } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Message text required' })
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null

    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { contact: { include: { phones: true, channels: true } } },
    })
    if (!deal) return res.status(404).json({ error: 'Deal not found' })

    const contact = deal.contact
    const msgTransport: string = transport ?? contact?.wazzupChannel ?? 'whatsapp'
    const isScheduled = Boolean(scheduledAt && scheduledAt > new Date())

    // Отложенная отправка остаётся на своём пути (BullMQ delayed job) — резолвим получателя той же
    // логикой, что и немедленная отправка, но передаём в scheduleMessage вместо sendViaTransport.
    if (isScheduled) {
      const { chatId: msgChatId, recipientType } = resolveRecipient({
        transport: msgTransport,
        contact,
        explicitChatId,
        explicitRecipientType,
      })

      const message = await prisma.message.create({
        data: {
          dealId: deal.id,
          contactId: contact?.id ?? null,
          channel: msgTransport,
          chatId: msgChatId,
          direction: 'out',
          content: text.trim(),
          status: msgChatId ? 'scheduled' : 'error',
          errorMsg: msgChatId ? null : 'Не задан получатель — укажите телефон или мессенджер контакта',
          scheduledAt,
        },
      })

      const rooms = [`pipeline:${deal.pipelineId}`, `deal:${deal.id}`, 'chats:inbox']
      if (contact) rooms.push(`contact:${contact.id}`)
      for (const room of rooms) emitToRoom(room, 'NEW_MESSAGE', { dealId: deal.id, message })

      if (msgChatId) {
        const { scheduleMessage } = await import('../services/scheduled-messages/worker')
        await scheduleMessage(message.id, msgChatId, msgTransport, scheduledAt!, deal.id, deal.pipelineId, recipientType)
      }

      return res.status(201).json(message)
    }

    const message = await sendMessageToContact({
      contact,
      dealId: deal.id,
      pipelineId: deal.pipelineId,
      transport: msgTransport,
      text: text.trim(),
      explicitChatId,
      explicitRecipientType,
    })

    return res.status(201).json(message)
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/emails', uploadEmailAttachments.array('files'), async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!
    const { accountId, to, subject, body } = req.body as Record<string, string>
    if (!accountId || !to?.trim() || !subject?.trim()) {
      return res.status(400).json({ error: 'accountId, to и subject обязательны' })
    }

    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } })
    if (!account) return res.status(404).json({ error: 'Почтовый ящик не найден' })
    if (!(await canAccessAccount(user, account))) return res.status(403).json({ error: 'Нет доступа к этому ящику' })

    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: { contact: true } })
    if (!deal) return res.status(404).json({ error: 'Deal not found' })

    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const threadKey = deal.contactId ?? to.trim().toLowerCase()

    const message = await prisma.message.create({
      data: {
        dealId: deal.id,
        contactId: deal.contactId,
        channel: 'email',
        direction: 'out',
        content: body?.trim() ?? '',
        subject: subject.trim(),
        toAddresses: [to.trim()],
        threadKey,
        emailAccountId: account.id,
        status: 'sending',
      },
    })

    const attachmentsForSend: { filename: string; content: Buffer; contentType: string }[] = []
    for (const f of files) {
      attachmentsForSend.push({ filename: f.originalname, content: f.buffer, contentType: f.mimetype })
      if (isStorageConfigured()) {
        const storageKey = await uploadObject(f.buffer, f.mimetype, f.originalname)
        await prisma.attachment.create({
          data: { messageId: message.id, filename: f.originalname, mimeType: f.mimetype, size: f.size, storageKey },
        })
      }
    }

    emitToRoom(`pipeline:${deal.pipelineId}`, 'NEW_MESSAGE', { dealId: deal.id, message })
    emitToRoom(`deal:${deal.id}`, 'NEW_MESSAGE', { dealId: deal.id, message })

    const emitStatus = (status: string, extra?: object) => {
      const payload = { dealId: deal.id, messageId: message.id, status, ...extra }
      emitToRoom(`pipeline:${deal.pipelineId}`, 'MESSAGE_STATUS', payload)
      emitToRoom(`deal:${deal.id}`, 'MESSAGE_STATUS', payload)
    }

    emailClient
      .sendEmailMessage({ accountId: account.id, to: to.trim(), subject: subject.trim(), text: body?.trim() ?? '', attachments: attachmentsForSend })
      .then(async ({ messageId }) => {
        await prisma.message.update({ where: { id: message.id }, data: { status: 'sent', emailMessageId: messageId } })
        emitStatus('sent')
      })
      .catch(async (err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : 'Ошибка отправки письма'
        await prisma.message.update({ where: { id: message.id }, data: { status: 'error', errorMsg } })
        emitStatus('error', { errorMsg })
      })

    return res.status(201).json(message)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id/messages/:messageId', async (req: AuthRequest, res, next) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Text required' })

    const message = await prisma.message.findUnique({ where: { id: req.params.messageId } })
    if (!message || message.dealId !== req.params.id) return res.status(404).json({ error: 'Message not found' })
    if (message.direction !== 'out') return res.status(400).json({ error: 'Can only edit outgoing messages' })

    // Try WazzUp edit (non-blocking — update DB regardless)
    if (message.wazzupId) {
      wazzupClient.editMessage(message.wazzupId, message.channel, text.trim()).catch(console.error)
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { content: text.trim() },
    })

    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, select: { pipelineId: true } })
    if (deal) {
      const payload = { dealId: req.params.id, messageId: message.id, content: text.trim() }
      emitToRoom(`pipeline:${deal.pipelineId}`, 'MESSAGE_EDITED', payload)
      emitToRoom(`deal:${req.params.id}`, 'MESSAGE_EDITED', payload)
    }

    return res.json(updated)
  } catch (err) {
    return next(err)
  }
})

export default router
