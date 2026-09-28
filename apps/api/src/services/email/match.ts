import { prisma } from '../../lib/prisma'

// deletedAt: null — контакты/сделки из корзины не матчатся (замечание 41 в CLAUDE.md)
export async function resolveContactByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  let contact = await prisma.contact.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' }, deletedAt: null },
  })
  if (!contact) {
    const contactEmail = await prisma.contactEmail.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' }, contact: { deletedAt: null } },
      include: { contact: true },
    })
    contact = contactEmail?.contact ?? null
  }
  return contact
}

export async function resolveDealForContact(contactId: string) {
  return prisma.deal.findFirst({
    where: { contactId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
}
