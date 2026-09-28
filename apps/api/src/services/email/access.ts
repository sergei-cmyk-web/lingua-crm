import { prisma } from '../../lib/prisma'
import type { AuthUser } from '../../middleware/auth'
import { userHasPermission } from '../roles/permissions'

export async function canAccessAccount(user: AuthUser, account: { ownerId: string; allowedUserIds: string[] }) {
  if (account.ownerId === user.id || account.allowedUserIds.includes(user.id)) return true
  return userHasPermission(user.id, 'data.viewAll')
}

/** Возвращает id аккаунтов, доступных пользователю, или null если видит все (data.viewAll). */
export async function getAccessibleAccountIds(user: AuthUser): Promise<string[] | null> {
  if (await userHasPermission(user.id, 'data.viewAll')) return null
  const accounts = await prisma.emailAccount.findMany({
    where: { OR: [{ ownerId: user.id }, { allowedUserIds: { has: user.id } }] },
    select: { id: true },
  })
  return accounts.map(a => a.id)
}
