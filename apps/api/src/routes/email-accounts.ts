import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { userHasPermission } from '../services/roles/permissions'
import { validate } from '../middleware/validate'
import { emailClient } from '../services/email/client'

const router = Router()
router.use(authMiddleware)

const PUBLIC_SELECT = { id: true, label: true, emailAddress: true, fromName: true, active: true, ownerId: true, allowedUserIds: true }

router.get('/', async (req, res, next) => {
  try {
    const user = (req as AuthRequest).user!
    const accounts = await prisma.emailAccount.findMany({
      where: (await userHasPermission(user.id, 'data.viewAll')) ? {} : { OR: [{ ownerId: user.id }, { allowedUserIds: { has: user.id } }] },
      select: PUBLIC_SELECT,
      orderBy: { label: 'asc' },
    })
    return res.json(accounts)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', requirePermission('settings.integrations'), async (req, res, next) => {
  try {
    const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } })
    if (!account) return res.status(404).json({ error: 'Not found' })
    const { smtpPassword, imapPassword, imapUidValidity, ...rest } = account
    return res.json({ ...rest, smtpPasswordSet: !!smtpPassword, imapPasswordSet: !!imapPassword })
  } catch (err) {
    return next(err)
  }
})

const accountSchema = z.object({
  label: z.string().min(1),
  emailAddress: z.string().email(),
  fromName: z.string().optional().nullable(),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().optional(), // пусто при PATCH = не менять
  imapHost: z.string().min(1),
  imapPort: z.number().int(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().min(1),
  imapPassword: z.string().optional(),
  ownerId: z.string().min(1),
  allowedUserIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
})

router.post('/', requirePermission('settings.integrations'), validate(accountSchema.required({ smtpPassword: true, imapPassword: true })), async (req, res, next) => {
  try {
    const account = await prisma.emailAccount.create({ data: req.body })
    const { smtpPassword, imapPassword, imapUidValidity, ...rest } = account
    return res.status(201).json({ ...rest, smtpPasswordSet: !!smtpPassword, imapPasswordSet: !!imapPassword })
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id', requirePermission('settings.integrations'), validate(accountSchema.partial()), async (req, res, next) => {
  try {
    const data = { ...req.body }
    // Пустая строка/undefined — не менять пароль (как targetsms_password)
    if (!data.smtpPassword) delete data.smtpPassword
    if (!data.imapPassword) delete data.imapPassword

    const account = await prisma.emailAccount.update({ where: { id: req.params.id }, data })
    emailClient.invalidateCache(account.id)
    const { smtpPassword, imapPassword, imapUidValidity, ...rest } = account
    return res.json({ ...rest, smtpPasswordSet: !!smtpPassword, imapPasswordSet: !!imapPassword })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', requirePermission('settings.integrations'), async (req, res, next) => {
  try {
    await prisma.emailAccount.delete({ where: { id: req.params.id } })
    emailClient.invalidateCache(req.params.id)
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/test', requirePermission('settings.integrations'), async (req, res, next) => {
  try {
    const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } })
    if (!account) return res.status(404).json({ error: 'Not found' })

    const result = await emailClient.testConnection(account)
    if (!result.smtp || !result.imap) return res.status(400).json({ ok: false, error: result.error })
    return res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка проверки подключения'
    return res.status(400).json({ ok: false, error: message })
  }
})

export default router
