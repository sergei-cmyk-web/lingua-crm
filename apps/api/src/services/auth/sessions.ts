import crypto from 'crypto'
import { redis } from '../../lib/redis'

// Активная refresh-сессия = ключ redis. Отсутствие ключа = отозвана/протухла/никогда не
// существовала — refresh с таким jti больше не проходит (защита от replay украденного токена).
const PREFIX = 'refresh:'
const key = (userId: string, jti: string) => `${PREFIX}${userId}:${jti}`

export function newJti(): string {
  return crypto.randomUUID()
}

export async function storeSession(userId: string, jti: string, ttlSeconds: number) {
  await redis.set(key(userId, jti), '1', 'EX', ttlSeconds)
}

export async function isSessionValid(userId: string, jti: string): Promise<boolean> {
  return (await redis.exists(key(userId, jti))) === 1
}

export async function revokeSession(userId: string, jti: string) {
  await redis.del(key(userId, jti))
}

// Логаут "everywhere" (смена пароля, ручной сброс сессий) — редко вызывается, набор сессий
// на юзера мал (одновременных логинов немного), поэтому KEYS-скан по префиксу приемлем.
// ponytail: KEYS блокирует Redis на размере ВСЕЙ базы, не только совпадений — если база вырастет
// или логаут-everywhere станет частым, завести SET refresh:sessions:{userId} с явным
// добавлением/удалением jti вместо скана по паттерну.
export async function revokeAllSessions(userId: string) {
  const keys = await redis.keys(`${PREFIX}${userId}:*`)
  if (keys.length) await redis.del(...keys)
}
