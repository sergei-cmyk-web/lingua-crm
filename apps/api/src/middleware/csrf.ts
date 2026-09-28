import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { parseCookieHeader } from '../lib/cookies'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Пути без cookie-сессии — CSRF неприменим, браузеру нечего подставить автоматически:
// вебхуки (подпись провайдера), захват лидов (сторонние формы, X-Form-Key), логин (сессии,
// а значит и csrf_token cookie, ещё не существует).
const EXEMPT_PREFIXES = ['/api/webhooks', '/api/leads', '/api/auth/login']

// Double-submit cookie: сессия аутентифицируется httpOnly-cookie (браузер шлёт её сам, в том
// числе с чужого сайта), поэтому на мутирующие запросы дополнительно требуем заголовок,
// который может выставить только наш собственный JS (он читает non-httpOnly csrf_token cookie).
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next()
  if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next()

  const cookieToken = parseCookieHeader(req.headers.cookie).csrf_token
  const headerToken = req.headers['x-csrf-token']

  if (
    !cookieToken ||
    typeof headerToken !== 'string' ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: 'Invalid CSRF token' })
  }
  next()
}
