import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

type CompanyStrategy = 'newest' | 'oldest'

export async function findCompanyDuplicateGroups() {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { contacts: true, deals: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const byName = new Map<string, typeof companies>()
  for (const c of companies) {
    const key = c.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(c)
  }
  return [...byName.values()].filter(group => group.length > 1)
}

export async function findCompanyMatches(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return []
  return prisma.company.findMany({
    where: { deletedAt: null, name: { equals: trimmed, mode: 'insensitive' } },
    take: 5,
  })
}

export async function mergeCompanies(ids: string[], strategy: CompanyStrategy) {
  const companies = await prisma.company.findMany({ where: { id: { in: ids }, deletedAt: null } })
  if (companies.length < 2) throw new Error('Need at least 2 active companies to merge')

  const sorted = [...companies].sort((a, b) =>
    strategy === 'newest' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()
  )
  const [survivor, ...losers] = sorted
  const loserIds = losers.map(l => l.id)

  const customFields: Record<string, unknown> = { ...(survivor.custom_fields as Record<string, unknown>) }
  for (const l of losers) {
    for (const [k, v] of Object.entries((l.custom_fields as Record<string, unknown>) ?? {})) {
      if (!(k in customFields)) customFields[k] = v
    }
  }

  await prisma.$transaction([
    prisma.contact.updateMany({ where: { companyId: { in: loserIds } }, data: { companyId: survivor.id } }),
    prisma.deal.updateMany({ where: { companyId: { in: loserIds } }, data: { companyId: survivor.id } }),
    prisma.task.updateMany({ where: { companyId: { in: loserIds } }, data: { companyId: survivor.id } }),
    prisma.company.update({ where: { id: survivor.id }, data: { custom_fields: customFields as Prisma.InputJsonValue } }),
    prisma.company.updateMany({ where: { id: { in: loserIds } }, data: { deletedAt: new Date() } }),
  ])

  return prisma.company.findUnique({ where: { id: survivor.id } })
}
