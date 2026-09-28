import { ALL_PERMISSIONS, type PermissionKey } from '@crm/shared'
import { prisma } from '../../lib/prisma'

// Кэш прав всех пользователей разом (масштаб ≤50 юзеров — один запрос), TTL 60с,
// тот же паттерн, что services/payments/settings.ts. Инвалидируется при любой
// записи в /users и /roles.
const TTL_MS = 60_000
let cache: { value: Map<string, Set<string>> | null; at: number } = { value: null, at: 0 }

export async function getPermissions(userId: string): Promise<Set<string>> {
  let map = cache.value
  if (!map || Date.now() - cache.at >= TTL_MS) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        role: { select: { name: true, isSystem: true, permissions: true } },
      },
    })
    map = new Map(
      users.map((u) => [
        u.id,
        // Системный admin получает все права из кода — новые ключи в PERMISSIONS
        // не требуют миграции данных, чтобы остаться доступными админу.
        new Set(
          u.role.isSystem && u.role.name === 'admin'
            ? (ALL_PERMISSIONS as string[])
            : u.role.permissions
        ),
      ])
    )
    cache = { value: map, at: Date.now() }
  }
  return map.get(userId) ?? new Set()
}

export async function userHasPermission(userId: string, perm: PermissionKey): Promise<boolean> {
  return (await getPermissions(userId)).has(perm)
}

export function invalidatePermissionsCache() {
  cache = { value: null, at: 0 }
}
