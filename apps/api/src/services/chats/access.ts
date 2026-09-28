import { prisma } from '../../lib/prisma'
import type { AuthUser } from '../../middleware/auth'
import { userHasPermission } from '../roles/permissions'

/**
 * Видимость чата (контакта) для менеджера: ответственный хотя бы по одной недалённой сделке
 * контакта (объединение по всем сделкам, не только последней). Если у контакта вообще нет
 * сделок — назначить не на кого, поэтому чат виден всем. Право data.viewAll видит всё всегда.
 */
export async function canViewContact(user: AuthUser, contactId: string): Promise<boolean> {
  if (await userHasPermission(user.id, 'data.viewAll')) return true
  const deals = await prisma.deal.findMany({
    where: { contactId, deletedAt: null },
    select: { assigneeId: true },
  })
  const assignees = deals.map(d => d.assigneeId).filter((id): id is string => Boolean(id))
  return assignees.length === 0 || assignees.includes(user.id)
}
