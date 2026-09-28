import { Router, type Request } from 'express'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'
import { triggerAutomation } from '../../services/automation/engine'
import { phoneCanonical } from '../../lib/phone'

const router = Router()

// Fail-closed by default when the secret isn't set — NOT gated on NODE_ENV (a typo'd/unset
// NODE_ENV in any non-'production' environment used to fail-open). Local dev without a
// configured secret must opt in explicitly via ALLOW_UNVERIFIED_WEBHOOKS=true.
const allowUnverifiedWebhooks = process.env.ALLOW_UNVERIFIED_WEBHOOKS === 'true'

function verifyWebhookAuth(req: Request): boolean {
  const secret = process.env.WAZZUP_WEBHOOK_SECRET
  if (!secret) return allowUnverifiedWebhooks

  // WazzUp не подписывает вебхуки (в их API нет HMAC/секрета вебхука вообще) —
  // аутентификация строится на секретном токене в самом URL вебхука:
  // webhooksUri регистрируется как .../api/webhooks/wazzup?token=<WAZZUP_WEBHOOK_SECRET>.
  // Дополнительно принимаем Authorization: Bearer <crmKey> — WazzUp шлёт этот
  // заголовок, если при подключении интеграции ему передан crmKey.
  const auth = req.headers.authorization
  const provided =
    (typeof req.query.token === 'string' ? req.query.token : undefined) ??
    (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined)
  if (!provided) return false

  const providedBuf = Buffer.from(provided)
  const secretBuf = Buffer.from(secret)
  // timingSafeEqual throws on length mismatch — guard first.
  if (providedBuf.length !== secretBuf.length) return false
  return crypto.timingSafeEqual(providedBuf, secretBuf)
}

// Значения, которыми WazzUp сообщает о недоставке; всё остальное (sent/delivered/read) — как есть.
const FAILURE_STATUSES = new Set(['failed', 'error', 'undelivered', 'notdelivered', 'rejected'])

async function handleStatusEntry(entry: Record<string, unknown>) {
  const entryMessageId = entry.messageId as string | undefined
  const rawStatus = (entry.status as string | undefined)?.toLowerCase()
  if (!entryMessageId || !rawStatus) return

  const normalized = FAILURE_STATUSES.has(rawStatus) ? 'error' : rawStatus
  // Имя точного поля с текстом причины WazzUp нигде не документирует — пробуем известные варианты
  // и логируем сырой payload, чтобы уточнить формат по факту первого реального failure в проде.
  const errorMsg = normalized === 'error'
    ? ((entry.description ?? entry.errorMessage ?? entry.error ?? entry.reason ??
        (entry.data as Record<string, unknown> | undefined)?.description ?? 'Ошибка доставки (см. WazzUp)') as string)
    : null
  if (normalized === 'error') {
    console.warn('[wazzup] messageStatus error:', entryMessageId, rawStatus)
    // Полное тело может содержать телефон/текст клиента — только по явному флагу
    if (process.env.LOG_WAZZUP_BODY === 'true') {
      console.warn('[wazzup] messageStatus error payload:', JSON.stringify(entry))
    }
  }

  const message = await prisma.message.findUnique({ where: { wazzupId: entryMessageId } })
  if (!message) return

  await prisma.message.update({
    where: { id: message.id },
    data: { status: normalized, errorMsg },
  })

  if (message.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: message.dealId } })
    if (deal) {
      const payload = { dealId: message.dealId, messageId: message.id, status: normalized, errorMsg }
      emitToRoom(`pipeline:${deal.pipelineId}`, 'MESSAGE_STATUS', payload)
      emitToRoom(`deal:${message.dealId}`, 'MESSAGE_STATUS', payload)
    }
  }
}

async function resolveTransportByChannelId(channelId: string | undefined): Promise<string | null> {
  if (!channelId) return null
  const setting = await prisma.integrationSetting.findUnique({ where: { key: 'wazzup_channels' } })
  if (!setting) return null
  const channels: { channelId: string; transport: string }[] = JSON.parse(setting.value)
  return channels.find(c => c.channelId === channelId)?.transport ?? null
}

// Реальный формат вебхука WazzUp — {"messages": [...]}, а не плоский {event, chatId, ...}, которого код
// ждал раньше (см. https://wazzup24.ru/help/api-ru/webhooks-2/ и замечание 49/50 в CLAUDE.md).
// Каждая запись — и входящее, и НАШЕ ЖЕ исходящее сообщение (isEcho: true для последнего — статус
// таких сообщений отслеживается отдельно через statuses, тут их только пропускаем).
async function handleMessageEntry(entry: Record<string, unknown>, rawBody: unknown) {
  if (entry.isEcho === true) return

  const messageId = entry.messageId as string | undefined
  const chatId = entry.chatId as string | undefined
  const channelIdRaw = entry.channelId as string | undefined
  if (!messageId || !chatId) return

  // A13 anti-replay: messageId is WazzUp's own event id (Message.wazzupId is @unique on it), so
  // it's already the natural idempotency key — a re-delivered/replayed webhook for a message we
  // already stored would otherwise still re-emit NEW_MESSAGE and re-fire triggerAutomation below.
  const alreadyProcessed = await prisma.message.findUnique({ where: { wazzupId: messageId }, select: { id: true } })
  if (alreadyProcessed) return

  // channelId → наш внутренний transport (tgapi/telegram/whatsapp/...) надёжнее, чем chatType от
  // WazzUp — chatType не различает личный Telegram-аккаунт и бота (см. замечание 14).
  const channel = (await resolveTransportByChannelId(channelIdRaw)) ?? (entry.chatType as string | undefined) ?? 'whatsapp'
  const text = (entry.text as string | undefined) ?? (entry.contentUri ? '[вложение]' : '')

  let contactId: string | null = null
  let dealId: string | null = null

  // Look up contact: сначала точный per-transport chatId (ContactChannel), затем legacy
  // wazzupChatId, затем по телефону. ВАЖНО: chatId для tgapi/max — это НЕ телефон, а внутренний
  // числовой ID Telegram/MAX-чата (подтверждено реальным трафиком: chatId="123456789" при
  // contact.phone="79001234567") — для WhatsApp chatId и есть телефон, для остального телефон
  // нужно брать из вложенного entry.contact.phone, который WazzUp присылает отдельно.
  const entryContact = entry.contact as Record<string, unknown> | undefined
  const phoneCandidate = channel === 'whatsapp' ? chatId : (entryContact?.phone as string | undefined)
  const normalizedPhone = phoneCandidate ? phoneCanonical(phoneCandidate) : null

  // deletedAt: null — контакты/сделки из корзины не матчатся, вместо них создаются новые
  let contact = await prisma.contact.findFirst({
    where: { channels: { some: { transport: channel, chatId } }, deletedAt: null },
  })
  if (!contact) {
    contact = await prisma.contact.findFirst({ where: { wazzupChatId: chatId, deletedAt: null } })
  }
  if (!contact && normalizedPhone) {
    contact = await prisma.contact.findFirst({ where: { phone: normalizedPhone, deletedAt: null } })
  }

  if (contact) {
    contactId = contact.id

    // Keep wazzupChatId/wazzupChannel current (legacy single-channel fields)
    if (contact.wazzupChatId !== chatId || contact.wazzupChannel !== channel) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { wazzupChatId: chatId, wazzupChannel: channel },
      })
    }

    // Upsert ContactChannel — per-transport chatId registry
    await prisma.contactChannel.upsert({
      where: { contactId_transport: { contactId: contact.id, transport: channel } },
      update: { chatId },
      create: { contactId: contact.id, transport: channel, chatId },
    })

    const deal = await prisma.deal.findFirst({
      where: { contactId: contact.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
    if (deal) dealId = deal.id
  }

  const message = await prisma.message.upsert({
    where: { wazzupId: messageId },
    update: {},
    create: {
      wazzupId: messageId,
      dealId,
      contactId,
      channel,
      channelId: channelIdRaw ?? null,
      chatId,
      direction: 'in',
      content: text,
      status: 'delivered',
    },
  })

  // contact:{id}/chats:inbox — независимо от dealId, иначе входящие от контакта без активной
  // сделки тихо не долетают никуда (раздел «Чаты» их как раз и должен показывать).
  if (contactId) {
    emitToRoom(`contact:${contactId}`, 'NEW_MESSAGE', { dealId, message })
    emitToRoom('chats:inbox', 'NEW_MESSAGE', { dealId, message })
  }

  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId } })
    if (deal) {
      // Обе комнаты — DealModal подписан на deal:{id}, канбан на pipeline:{id}; открытая карточка
      // не с канбана не состоит в pipeline-комнате (см. CLAUDE.md замечание 12).
      emitToRoom(`pipeline:${deal.pipelineId}`, 'NEW_MESSAGE', { dealId, message })
      emitToRoom(`deal:${dealId}`, 'NEW_MESSAGE', { dealId, message })
      await triggerAutomation({ type: 'webhook', deal, source: 'wazzup', channelId: channelIdRaw, payload: rawBody })
    }
  }
}

router.post('/', async (req, res) => {
  if (!verifyWebhookAuth(req)) {
    return res.status(401).json({ error: 'Invalid webhook token' })
  }

  // Тело вебхука содержит телефоны и тексты переписки — логируем только по явному флагу
  if (process.env.LOG_WAZZUP_BODY === 'true') {
    console.log('[wazzup] webhook received:', JSON.stringify(req.body))
  }

  const { event, messageId, status: msgStatus, statuses, messages } = req.body

  // Message delivery status update(s) — задокументированный формат {statuses: [...]}, плюс плоский
  // {event: 'messageStatus', messageId, status} на случай если аккаунт когда-то пришлёт по-старому.
  if (Array.isArray(statuses)) {
    for (const entry of statuses) await handleStatusEntry(entry)
  } else if (event === 'messageStatus' && messageId) {
    await handleStatusEntry({ messageId, status: msgStatus })
  }

  if (Array.isArray(messages)) {
    for (const entry of messages) await handleMessageEntry(entry, req.body)
  }

  return res.status(200).json({ ok: true })
})

export default router
