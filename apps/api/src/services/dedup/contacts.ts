import { prisma } from '../../lib/prisma'
import { phoneDigits } from '../../lib/phone'

type ContactStrategy = 'newest' | 'oldest'

const dedupInclude = {
  phones: true,
  emails: true,
  company: { select: { id: true, name: true } },
}

function contactPhoneDigits(c: { phone: string | null; phones: { phone: string }[] }): string[] {
  return [c.phone, ...c.phones.map(p => p.phone)]
    .filter((p): p is string => !!p)
    .map(phoneDigits)
    .filter(Boolean)
}

function contactEmails(c: { email: string | null; emails: { email: string }[] }): string[] {
  return [c.email, ...c.emails.map(e => e.email)]
    .filter((e): e is string => !!e)
    .map(e => e.toLowerCase().trim())
}

// ponytail: full-table scan+normalize, upgrade to a normalized-phone/email column+index if contacts count grows well past 10k
async function loadContactsForDedup() {
  return prisma.contact.findMany({ where: { deletedAt: null }, include: dedupInclude })
}

export async function findContactDuplicateGroups() {
  const contacts = await loadContactsForDedup()
  const byId = new Map(contacts.map(c => [c.id, c]))

  const adjacency = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    if (a === b) return
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }

  const phoneMap = new Map<string, string[]>()
  const emailMap = new Map<string, string[]>()
  for (const c of contacts) {
    for (const p of new Set(contactPhoneDigits(c))) {
      if (!phoneMap.has(p)) phoneMap.set(p, [])
      phoneMap.get(p)!.push(c.id)
    }
    for (const e of new Set(contactEmails(c))) {
      if (!emailMap.has(e)) emailMap.set(e, [])
      emailMap.get(e)!.push(c.id)
    }
  }
  for (const ids of [...phoneMap.values(), ...emailMap.values()]) {
    if (ids.length < 2) continue
    for (let i = 1; i < ids.length; i++) addEdge(ids[0], ids[i])
  }

  const visited = new Set<string>()
  const groups: (typeof contacts)[] = []
  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue
    const stack = [id]
    const componentIds: string[] = []
    while (stack.length) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      componentIds.push(cur)
      for (const n of adjacency.get(cur) ?? []) if (!visited.has(n)) stack.push(n)
    }
    groups.push(componentIds.map(cid => byId.get(cid)!).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
  }
  return groups
}

export async function findContactMatches(phone?: string, email?: string) {
  const digits = phone ? phoneDigits(phone) : ''
  const emailNorm = email ? email.toLowerCase().trim() : ''
  if (!digits && !emailNorm) return []

  const contacts = await loadContactsForDedup()
  return contacts
    .filter(c => (digits && contactPhoneDigits(c).includes(digits)) || (emailNorm && contactEmails(c).includes(emailNorm)))
    .slice(0, 5)
}

export async function mergeContacts(ids: string[], strategy: ContactStrategy) {
  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { phones: true, emails: true, channels: true },
  })
  if (contacts.length < 2) throw new Error('Need at least 2 active contacts to merge')

  const sorted = [...contacts].sort((a, b) =>
    strategy === 'newest' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()
  )
  const [survivor, ...losers] = sorted
  const loserIds = losers.map(l => l.id)

  const scalarUpdate: Record<string, unknown> = {}
  for (const field of ['phone', 'email', 'telegramUsername', 'companyId'] as const) {
    if (!survivor[field]) {
      const donor = losers.find(l => l[field])
      if (donor) scalarUpdate[field] = donor[field]
    }
  }
  const customFields: Record<string, unknown> = { ...(survivor.custom_fields as Record<string, unknown>) }
  for (const l of losers) {
    for (const [k, v] of Object.entries((l.custom_fields as Record<string, unknown>) ?? {})) {
      if (!(k in customFields)) customFields[k] = v
    }
  }
  scalarUpdate.custom_fields = customFields

  // Основной телефон/email проигравшего, если он отличается от итогового значения survivor'а,
  // не должен теряться — переносим его доп. записью (ContactPhone/ContactEmail), а не отбрасываем.
  const finalPhone = (scalarUpdate.phone as string | undefined) ?? survivor.phone
  const finalEmail = (scalarUpdate.email as string | undefined) ?? survivor.email
  const knownPhoneDigits = new Set(contactPhoneDigits({ phone: finalPhone, phones: survivor.phones }))
  const knownEmails = new Set(contactEmails({ email: finalEmail, emails: survivor.emails }))
  const extraPhones: { contactId: string; phone: string; label: string }[] = []
  const extraEmails: { contactId: string; email: string; label: null }[] = []
  for (const l of losers) {
    if (l.phone) {
      const digits = phoneDigits(l.phone)
      if (digits && !knownPhoneDigits.has(digits)) {
        knownPhoneDigits.add(digits)
        extraPhones.push({ contactId: survivor.id, phone: l.phone, label: 'mobile' })
      }
    }
    if (l.email) {
      const normalized = l.email.toLowerCase().trim()
      if (normalized && !knownEmails.has(normalized)) {
        knownEmails.add(normalized)
        extraEmails.push({ contactId: survivor.id, email: l.email, label: null })
      }
    }
  }

  const survivorTransports = new Set(survivor.channels.map(c => c.transport))
  const channelIdsToMove: string[] = []
  const channelIdsToDrop: string[] = []
  for (const l of losers) {
    for (const c of l.channels) {
      if (survivorTransports.has(c.transport)) channelIdsToDrop.push(c.id)
      else {
        channelIdsToMove.push(c.id)
        survivorTransports.add(c.transport)
      }
    }
  }

  await prisma.$transaction([
    prisma.deal.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.task.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.message.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.subscription.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.payment.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.contactPhone.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    prisma.contactEmail.updateMany({ where: { contactId: { in: loserIds } }, data: { contactId: survivor.id } }),
    ...(channelIdsToMove.length ? [prisma.contactChannel.updateMany({ where: { id: { in: channelIdsToMove } }, data: { contactId: survivor.id } })] : []),
    ...(channelIdsToDrop.length ? [prisma.contactChannel.deleteMany({ where: { id: { in: channelIdsToDrop } } })] : []),
    ...(extraPhones.length ? [prisma.contactPhone.createMany({ data: extraPhones })] : []),
    ...(extraEmails.length ? [prisma.contactEmail.createMany({ data: extraEmails })] : []),
    prisma.contact.update({ where: { id: survivor.id }, data: scalarUpdate }),
    prisma.contact.updateMany({ where: { id: { in: loserIds } }, data: { deletedAt: new Date() } }),
  ])

  return prisma.contact.findUnique({ where: { id: survivor.id }, include: dedupInclude })
}
