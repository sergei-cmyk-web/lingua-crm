import { ImapFlow } from 'imapflow'
import { simpleParser, type AddressObject } from 'mailparser'
import type { EmailAccount } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { resolveContactByEmail, resolveDealForContact } from './match'
import { uploadObject, isStorageConfigured } from '../storage/s3'
import { emitToRoom } from '../../socket/handlers'

const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS) || 120_000

function flattenAddresses(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return []
  const objects = Array.isArray(field) ? field : [field]
  return objects.flatMap(o => o.value.map(v => v.address)).filter((a): a is string => Boolean(a))
}

export async function pollAllAccounts() {
  const accounts = await prisma.emailAccount.findMany({ where: { active: true } })
  for (const account of accounts) {
    try {
      await pollAccount(account)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[email] IMAP poll failed for account ${account.id} (${account.emailAddress}):`, message)
      await prisma.emailAccount
        .update({ where: { id: account.id }, data: { lastError: message, lastPolledAt: new Date() } })
        .catch(() => {})
    }
  }
}

async function pollAccount(account: EmailAccount) {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.imapUser, pass: account.imapPassword },
    logger: false,
  })

  await client.connect()
  try {
    const mailbox = await client.mailboxOpen('INBOX')

    // Ящик пересоздан (UIDVALIDITY изменился) — старые UID больше не валидны, опрашиваем заново
    const uidValidityChanged =
      account.imapUidValidity != null && BigInt(account.imapUidValidity) !== mailbox.uidValidity
    let lastUid = uidValidityChanged ? 0 : account.lastImapUid
    let maxUid = lastUid

    if (mailbox.uidNext > lastUid + 1) {
      for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue
        try {
          await processMessage(account, msg.source)
        } catch (err) {
          console.error(`[email] failed to process message uid=${msg.uid} for account ${account.id}:`, err)
        }
        if (msg.uid > maxUid) maxUid = msg.uid
      }
    }

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        imapUidValidity: mailbox.uidValidity,
        lastImapUid: maxUid,
        lastPolledAt: new Date(),
        lastError: null,
      },
    })
  } finally {
    await client.logout().catch(() => client.close())
  }
}

async function processMessage(account: EmailAccount, source: Buffer) {
  const parsed = await simpleParser(source)
  const messageId = parsed.messageId
  if (!messageId) return // без Message-ID нет идемпотентного ключа — пропускаем (редкий случай)

  const existing = await prisma.message.findUnique({ where: { emailMessageId: messageId } })
  if (existing) return // уже обработано на прошлом опросе

  const fromAddress = parsed.from?.value?.[0]?.address ?? ''
  const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
  const inReplyTo = parsed.inReplyTo ?? references[references.length - 1]

  let dealId: string | null = null
  let contactId: string | null = null
  let threadKey: string = fromAddress.toLowerCase()

  // 1. Точный тред — если это ответ на письмо, отправленное нами
  if (inReplyTo) {
    const parent = await prisma.message.findUnique({ where: { emailMessageId: inReplyTo } })
    if (parent) {
      dealId = parent.dealId
      contactId = parent.contactId
      threadKey = parent.threadKey ?? threadKey
    }
  }

  // 2. Иначе — матчинг контакта по email отправителя (только существующие, без авто-создания)
  if (!contactId && fromAddress) {
    const contact = await resolveContactByEmail(fromAddress)
    if (contact) {
      contactId = contact.id
      threadKey = contact.id
      if (!dealId) {
        const deal = await resolveDealForContact(contact.id)
        dealId = deal?.id ?? null
      }
    }
  }

  const toAddresses = flattenAddresses(parsed.to)
  const ccAddresses = flattenAddresses(parsed.cc)

  const message = await prisma.message.create({
    data: {
      dealId,
      contactId,
      channel: 'email',
      direction: 'in',
      content: parsed.text ?? '',
      subject: parsed.subject ?? null,
      bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
      toAddresses,
      ccAddresses,
      emailMessageId: messageId,
      emailInReplyTo: inReplyTo ?? null,
      threadKey,
      emailAccountId: account.id,
      status: 'delivered',
    },
  })

  if (parsed.attachments?.length && isStorageConfigured()) {
    for (const att of parsed.attachments) {
      try {
        const storageKey = await uploadObject(att.content, att.contentType, att.filename ?? undefined)
        await prisma.attachment.create({
          data: {
            messageId: message.id,
            filename: att.filename ?? 'attachment',
            mimeType: att.contentType,
            size: att.size ?? att.content.length,
            storageKey,
          },
        })
      } catch (err) {
        console.error(`[email] failed to store attachment for message ${message.id}:`, err)
      }
    }
  }

  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { pipelineId: true } })
    if (deal) {
      emitToRoom(`pipeline:${deal.pipelineId}`, 'NEW_MESSAGE', { dealId, message })
      emitToRoom(`deal:${dealId}`, 'NEW_MESSAGE', { dealId, message })
    }
  }
  emitToRoom('email:inbox', 'NEW_EMAIL', { message })
}

let started = false
export function startEmailImapWorker() {
  if (started) return
  started = true
  setInterval(() => {
    pollAllAccounts().catch(err => console.error('[email] IMAP sweep failed:', err))
  }, POLL_INTERVAL_MS)
  setTimeout(() => {
    pollAllAccounts().catch(err => console.error('[email] IMAP initial sweep failed:', err))
  }, 10_000)
}

startEmailImapWorker()
