import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { userHasPermission } from '../services/roles/permissions'
import { canViewContact } from '../services/chats/access'
import { sendMessageToContact } from '../services/messaging/sendToContact'
import { parsePagination } from '../lib/pagination'

const router = Router()
router.use(authMiddleware, requirePermission('section.chats'))

// Раздел «Чаты» — единый инбокс мессенджеров (не email). Один чат = один контакт, все его каналы
// (WhatsApp/Telegram/MAX/SMS/...) в одной ленте. Сообщения без contactId (WazzUp не смог
// сматчить отправителя) группируются отдельно по chatId и показываются как «Неизвестный контакт» —
// без владельца, поэтому видны всем (та же логика, что у контакта без сделок в canViewContact).

// Список чатов текущего пользователя — последнее сообщение на контакт (+ несматченные по chatId) + непрочитанные.
router.get('/', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const { limit } = parsePagination(req.query, 30)
    const search = req.query.search ? String(req.query.search) : undefined

    const matchedWhere: Record<string, unknown> = {
      channel: { not: 'email' }, contactId: { not: null }, contact: { deletedAt: null },
    }
    if (search) {
      matchedWhere.OR = [
        { content: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { phone: { contains: search, mode: 'insensitive' } } },
      ]
    }
    // take: limit — иначе distinct сканирует ВСЕ сообщения; берём только limit свежих чатов
    // (пагинация limit-grow, как в email.ts). Overflow подтягивается ростом limit с фронта.
    const matched = await prisma.message.findMany({
      where: matchedWhere,
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      take: limit,
      include: { contact: { select: { id: true, name: true, phone: true } } },
    })

    const unmatchedWhere: Record<string, unknown> = { channel: { not: 'email' }, contactId: null, chatId: { not: null } }
    if (search) unmatchedWhere.content = { contains: search, mode: 'insensitive' }
    const unmatched = await prisma.message.findMany({
      where: unmatchedWhere,
      orderBy: { createdAt: 'desc' },
      distinct: ['chatId'],
      take: limit,
    })

    const contactIds = matched.map(m => m.contactId!).filter(Boolean)
    const chatIds = unmatched.map(m => m.chatId!).filter(Boolean)

    const [unreadByContact, unreadByChat] = await Promise.all([
      contactIds.length
        ? prisma.message.groupBy({
            by: ['contactId'],
            where: { contactId: { in: contactIds }, channel: { not: 'email' }, direction: 'in', readAt: null },
            _count: { _all: true },
          })
        : [],
      chatIds.length
        ? prisma.message.groupBy({
            by: ['chatId'],
            where: { chatId: { in: chatIds }, contactId: null, channel: { not: 'email' }, direction: 'in', readAt: null },
            _count: { _all: true },
          })
        : [],
    ])
    const unreadByContactMap = Object.fromEntries(unreadByContact.map(u => [u.contactId as string, u._count._all]))
    const unreadByChatMap = Object.fromEntries(unreadByChat.map(u => [u.chatId as string, u._count._all]))

    let visibleContactIds: Set<string> | null = null // null = видно всё (data.viewAll)
    if (!(await userHasPermission(user.id, 'data.viewAll'))) {
      const deals = await prisma.deal.findMany({
        where: { contactId: { in: contactIds }, deletedAt: null },
        select: { contactId: true, assigneeId: true },
      })
      const assigneesByContact = new Map<string, Set<string>>()
      for (const d of deals) {
        if (!d.contactId || !d.assigneeId) continue
        if (!assigneesByContact.has(d.contactId)) assigneesByContact.set(d.contactId, new Set())
        assigneesByContact.get(d.contactId)!.add(d.assigneeId)
      }
      visibleContactIds = new Set(
        contactIds.filter(id => {
          const assignees = assigneesByContact.get(id)
          return !assignees || assignees.size === 0 || assignees.has(user.id)
        })
      )
    }

    const matchedRows = matched
      .filter(m => !visibleContactIds || visibleContactIds.has(m.contactId!))
      .map(m => ({
        id: m.contactId as string,
        contactId: m.contactId,
        contactName: m.contact?.name ?? '—',
        contactPhone: m.contact?.phone ?? null,
        lastMessage: { channel: m.channel, direction: m.direction, content: m.content, createdAt: m.createdAt, status: m.status },
        unreadCount: unreadByContactMap[m.contactId!] ?? 0,
      }))

    const unmatchedRows = unmatched.map(m => ({
      id: `unmatched:${m.chatId}`,
      contactId: null,
      contactName: 'Неизвестный контакт',
      contactPhone: null,
      lastMessage: { channel: m.channel, direction: m.direction, content: m.content, createdAt: m.createdAt, status: m.status },
      unreadCount: unreadByChatMap[m.chatId!] ?? 0,
    }))

    const all = [...matchedRows, ...unmatchedRows].sort(
      (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    )

    return res.json(all.slice(0, limit))
  } catch (err) {
    return next(err)
  }
})

// Открыть несматченный чат (по chatId, без контакта) — видно всем, владельца нет.
router.get('/unmatched/:chatId', async (req, res, next) => {
  try {
    const where = { contactId: null, chatId: req.params.chatId, channel: { not: 'email' } }
    const messages = await prisma.message.findMany({ where, orderBy: { createdAt: 'asc' } })
    if (!messages.length) return res.status(404).json({ error: 'Not found' })

    await prisma.message.updateMany({ where: { ...where, direction: 'in', readAt: null }, data: { readAt: new Date() } })

    return res.json({ contact: null, messages })
  } catch (err) {
    return next(err)
  }
})

// Ответ в несматченный чат — транспорт берётся из последнего сообщения этого chatId (контакта нет).
router.post('/unmatched/:chatId/messages', async (req, res, next) => {
  try {
    const { text } = req.body as Record<string, string | undefined>
    if (!text?.trim()) return res.status(400).json({ error: 'Message text required' })

    const last = await prisma.message.findFirst({
      where: { contactId: null, chatId: req.params.chatId, channel: { not: 'email' } },
      orderBy: { createdAt: 'desc' },
    })
    if (!last) return res.status(404).json({ error: 'Чат не найден' })

    const message = await sendMessageToContact({
      contact: null,
      dealId: null,
      pipelineId: null,
      transport: last.channel,
      text: text.trim(),
      explicitChatId: req.params.chatId,
    })

    return res.status(201).json(message)
  } catch (err) {
    return next(err)
  }
})

// Открыть чат — вся переписка контакта по мессенджерам, помечает непрочитанные как прочитанные.
router.get('/:contactId', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.contactId, deletedAt: null },
      include: {
        phones: { select: { id: true, phone: true, label: true } },
        emails: { select: { id: true, email: true, label: true } },
        channels: { select: { id: true, transport: true, chatId: true } },
      },
    })
    if (!contact) return res.status(404).json({ error: 'Контакт не найден' })
    if (!(await canViewContact(user, contact.id))) return res.status(403).json({ error: 'Forbidden' })

    const messages = await prisma.message.findMany({
      where: { contactId: contact.id, channel: { not: 'email' } },
      orderBy: { createdAt: 'asc' },
    })

    await prisma.message.updateMany({
      where: { contactId: contact.id, channel: { not: 'email' }, direction: 'in', readAt: null },
      data: { readAt: new Date() },
    })

    return res.json({ contact, messages })
  } catch (err) {
    return next(err)
  }
})

// Ответ в чат — только в уже существующую переписку (транспорт выбирает фронт из каналов контакта).
router.post('/:contactId/messages', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!
    const { text, transport, chatId: explicitChatId } = req.body as Record<string, string | undefined>
    if (!text?.trim()) return res.status(400).json({ error: 'Message text required' })
    if (!transport?.trim()) return res.status(400).json({ error: 'Transport required' })

    const contact = await prisma.contact.findFirst({
      where: { id: req.params.contactId, deletedAt: null },
      include: { channels: { select: { transport: true, chatId: true } } },
    })
    if (!contact) return res.status(404).json({ error: 'Контакт не найден' })
    if (!(await canViewContact(user, contact.id))) return res.status(403).json({ error: 'Forbidden' })

    // Если у контакта ровно одна активная сделка — сообщение сразу привязывается к ней
    // (видно и в карточке сделки); при 0 или нескольких сделках dealId остаётся null.
    const deals = await prisma.deal.findMany({
      where: { contactId: contact.id, deletedAt: null },
      select: { id: true, pipelineId: true },
    })
    const soleDeal = deals.length === 1 ? deals[0] : null

    const message = await sendMessageToContact({
      contact,
      dealId: soleDeal?.id ?? null,
      pipelineId: soleDeal?.pipelineId ?? null,
      transport: transport.trim(),
      text: text.trim(),
      explicitChatId: explicitChatId?.trim() || null,
    })

    return res.status(201).json(message)
  } catch (err) {
    return next(err)
  }
})

export default router
