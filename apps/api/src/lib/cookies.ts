import type { Response } from 'express'

const isProd = process.env.NODE_ENV === 'production'

/** Minimal `Cookie` header parser — avoids pulling in cookie-parser for a one-shot key=value split. */
export function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    const raw = part.slice(idx + 1).trim()
    try {
      out[key] = decodeURIComponent(raw)
    } catch {
      out[key] = raw
    }
  }
  return out
}

const baseOpts = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/' }

export function setAuthCookies(
  res: Response,
  accessToken: string,
  accessMaxAgeMs: number,
  refreshToken: string,
  refreshMaxAgeMs: number,
  csrfToken: string
) {
  res.cookie('access_token', accessToken, { ...baseOpts, maxAge: accessMaxAgeMs })
  res.cookie('refresh_token', refreshToken, { ...baseOpts, maxAge: refreshMaxAgeMs })
  // Double-submit CSRF cookie — must be readable by JS, so NOT httpOnly.
  res.cookie('csrf_token', csrfToken, { httpOnly: false, secure: isProd, sameSite: 'lax', path: '/', maxAge: refreshMaxAgeMs })
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', baseOpts)
  res.clearCookie('refresh_token', baseOpts)
  res.clearCookie('csrf_token', { httpOnly: false, secure: isProd, sameSite: 'lax', path: '/' })
}
