import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { PermissionKey } from '@crm/shared'
import { getPermissions } from '../services/roles/permissions'
import { parseCookieHeader } from '../lib/cookies'

export interface AuthUser {
  id: string
  email: string
  role: string
}

export interface AuthRequest extends Request {
  user?: AuthUser
}

/** Verify an access token and return its payload, or throw if invalid. */
export function verifyAccessToken(token: string): AuthUser {
  return jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as AuthUser
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Основной путь — httpOnly access_token cookie (браузер шлёт сам). Authorization: Bearer
  // остаётся как fallback для curl/скриптов (webhook-test и т.п.), не используется фронтендом.
  const header = req.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  const token = parseCookieHeader(req.headers.cookie).access_token || bearer
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    req.user = verifyAccessToken(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

/** Restrict a route to users whose role grants the permission. Requires authMiddleware first. */
export function requirePermission(perm: PermissionKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    if (!(await getPermissions(req.user.id)).has(perm)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
