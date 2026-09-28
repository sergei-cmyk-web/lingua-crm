import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

redis.on('error', (err) => console.error('Redis error:', err))
redis.on('connect', () => console.log('Redis connected'))

// Кэш-чтение с таймаутом: под maxRetriesPerRequest:null недоступный Redis подвесил бы get навсегда
// (замечание 33) — гонка с 200мс таймаутом отдаёт null, и вызывающий просто считает данные заново.
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await Promise.race([
      redis.get(key),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 200)),
    ])
  } catch {
    return null
  }
}

// Запись кэша — fire-and-forget: сбой/недоступность Redis не должны влиять на ответ.
export function cacheSet(key: string, value: string, ttlSeconds: number): void {
  redis.set(key, value, 'EX', ttlSeconds).catch(() => {})
}

// Опции воркеров BullMQ. Дефолты (drainDelay 5с, stalledInterval 30с) при трёх воркерах дают
// заметный idle-поллинг вхолостую. drainDelay 60с — воркер всё равно просыпается мгновенно по
// маркеру нового джоба, реже опрашивает лишь при простое; stalledInterval 5мин — медленнее
// ловит упавшие джобы, приемлемо. На своём Redis это просто меньше лишнего трафика.
export const workerTuning = { drainDelay: 60, stalledInterval: 300_000 } as const
