import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { emailClient } from '../services/email/client'
import { uploadObject, isStorageConfigured, getSignedDownloadUrl } from '../services/storage/s3'
import { resolveContactByEmail, resolveDealForContact } from '../services/email/match'
import { canAccessAccount, getAccessibleAccountIds } from '../services/email/access'
import { emitToRoom } from '../socket/handlers'
import { parsePagination } from '../lib/pagination'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
const router = Router()
router.use(authMiddleware, requirePermission('section.email'))

// Единый инбокс — список тредов (последнее сообщение на тред + счётчик непрочитанных)
router.get('/threads', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const accountIds = await getAccessibleAccountIds(user)
    const { page, limit } = parsePagination(req.query, 30)
    const search = req.query.search ? String(req.query.search) : undefined

    const where: Record<string, unknown> = { channel: 'email', threadKey: { not: null } }
    if (accountIds) where.emailAccountId = { in: accountIds }
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    const latest = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      distinct: ['threadKey'],
      skip: (page - 1) * limit,
      take: limit,
    })

    const threadKeys = latest.map(m => m.threadKey).filter((k): k is string => Boolean(k))
    const unreadCounts = threadKeys.length
      ? await prisma.message.groupBy({
          by: ['threadKey'],
          where: { channel: 'email', direction: 'in', readAt: null, threadKey: { in: threadKeys } },
          _count: { _all: true },
        })
      : []
    const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.threadKey, u._count._all]))

    return res.json(latest.map(m => ({ ...m, unread: m.threadKey ? unreadMap[m.threadKey] ?? 0 : 0 })))
  } catch (err) {
    return next(err)
  }
})

// Полная переписка треда — помечает непрочитанные входящие как прочитанные
router.get('/threads/:threadKey', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const accountIds = await getAccessibleAccountIds(user)

    const where: Record<string, unknown> = { channel: 'email', threadKey: req.params.threadKey }
    if (accountIds) where.emailAccountId = { in: accountIds }

    const messages = await prisma.message.findMany({ where, orderBy: { createdAt: 'asc' }, include: { attachments: true } })
    if (!messages.length) return res.status(404).json({ error: 'Not found' })

    await prisma.message.updateMany({ where: { ...where, direction: 'in', readAt: null }, data: { readAt: new Date() } })

    return res.json(messages)
  } catch (err) {
    return next(err)
  }
})

// Новое письмо, не привязанное к конкретной сделке (получатель вводится вручную)
router.post('/compose', upload.array('files'), async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const { accountId, to, subject, body } = req.body as Record<string, string>
    if (!accountId || !to || !subject) {
      return res.status(400).json({ error: 'accountId, to и subject обязательны' })
    }

    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } })
    if (!account) return res.status(404).json({ error: 'Почтовый ящик не найден' })
    if (!(await canAccessAccount(user, account))) return res.status(403).json({ error: 'Нет доступа к этому ящику' })

    const contact = await resolveContactByEmail(to)
    const dealId = contact ? (await resolveDealForContact(contact.id))?.id ?? null : null
    const threadKey = contact?.id ?? to.trim().toLowerCase()

    const files = (req.files as Express.Multer.File[] | undefined) ?? []

    const message = await prisma.message.create({
      data: {
        dealId,
        contactId: contact?.id ?? null,
        channel: 'email',
        direction: 'out',
        content: body ?? '',
        subject,
        toAddresses: [to],
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

    emitToRoom('email:inbox', 'NEW_EMAIL', { message })

    emailClient
      .sendEmailMessage({ accountId: account.id, to, subject, text: body ?? '', attachments: attachmentsForSend })
      .then(async ({ messageId }) => {
        await prisma.message.update({ where: { id: message.id }, data: { status: 'sent', emailMessageId: messageId } })
        emitToRoom('email:inbox', 'MESSAGE_STATUS', { messageId: message.id, status: 'sent' })
      })
      .catch(async (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err)
        await prisma.message.update({ where: { id: message.id }, data: { status: 'error', errorMsg } })
        emitToRoom('email:inbox', 'MESSAGE_STATUS', { messageId: message.id, status: 'error', errorMsg })
      })

    return res.status(201).json(message)
  } catch (err) {
    return next(err)
  }
})

// Signed URL на скачивание вложения — доступ проверяется по аккаунту письма
router.get('/attachments/:id/download', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id }, include: { message: true } })
    if (!attachment) return res.status(404).json({ error: 'Not found' })

    if (attachment.message.emailAccountId) {
      const account = await prisma.emailAccount.findUnique({ where: { id: attachment.message.emailAccountId } })
      if (account && !(await canAccessAccount(user, account))) return res.status(403).json({ error: 'Forbidden' })
    }

    const url = await getSignedDownloadUrl(attachment.storageKey)
    return res.json({ url })
  } catch (err) {
    return next(err)
  }
})

export default router
