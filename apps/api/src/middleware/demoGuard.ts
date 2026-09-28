import type { Request, Response, NextFunction } from 'express'

// Демо-стенд: реальные мутации не должны трогать общую seed-БД, которую видят все посетители —
// изоляция построена на клиенте (см. apps/web/src/lib/demo/adapter.ts), фронтенд в норме сюда
// вообще не достучится. Это защита в глубину на случай прямого вызова API (curl/devtools).
const PASSTHROUGH = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'])

export function demoGuard(req: Request, res: Response, next: NextFunction) {
  if (process.env.DEMO_MODE !== 'true') return next()
  const isMutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS'
  if (!isMutating || PASSTHROUGH.has(req.path)) return next()
  return res.status(200).json({ ok: true, demo: true })
}
