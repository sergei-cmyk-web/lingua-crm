import { Router, type Request } from 'express'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'

const router = Router()

// Same fail-closed-by-default policy as webhooks/wazzup.ts — see comment there.
const allowUnverifiedWebhooks = process.env.ALLOW_UNVERIFIED_WEBHOOKS === 'true'

function verifyUis(req: Request): boolean {
  const apiKey = process.env.UIS_API_KEY
  if (!apiKey) return allowUnverifiedWebhooks

  const auth = req.headers['authorization']
  if (typeof auth !== 'string') return false

  const authBuf = Buffer.from(auth)
  const expBuf = Buffer.from(`Bearer ${apiKey}`)
  if (authBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(authBuf, expBuf)
}

router.post('/', async (req, res) => {
  if (!verifyUis(req)) return res.status(401).json({ error: 'Unauthorized' })

  const { event, callId, direction, callerNumber, calleeNumber, duration, recordUrl } = req.body

  const phone = direction === 'in' ? callerNumber : calleeNumber
  const normalizedPhone = phone ? `+${String(phone).replace(/\D/g, '')}` : null

  let dealId: string | null = null
  if (normalizedPhone) {
    const contact = await prisma.contact.findFirst({ where: { phone: normalizedPhone, deletedAt: null } })
    if (contact) {
      const deal = await prisma.deal.findFirst({
        where: { contactId: contact.id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      })
      if (deal) dealId = deal.id
    }
  }

  const call = await prisma.call.upsert({
    where: { uisCallId: callId ?? `uis-${Date.now()}` },
    update: { duration: duration ?? null, recordUrl: recordUrl ?? null },
    create: {
      uisCallId: callId,
      dealId,
      direction: direction ?? 'in',
      duration: duration ?? null,
      recordUrl: recordUrl ?? null,
      phone: normalizedPhone,
    },
  })

  if (dealId && event === 'call.finished') {
    const deal = await prisma.deal.findUnique({ where: { id: dealId } })
    if (deal) {
      await prisma.activity.create({
        data: { dealId, type: 'call', payload: { direction, duration, recordUrl, phone: normalizedPhone } },
      })
      emitToRoom(`pipeline:${deal.pipelineId}`, 'NEW_CALL', { dealId, call })
    }
  }

  return res.status(200).json({ ok: true })
})

export default router
