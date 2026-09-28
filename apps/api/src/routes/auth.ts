import crypto from 'crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import ms from 'ms'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { parseCookieHeader, setAuthCookies, clearAuthCookies } from '../lib/cookies'
import { getPermissions, userHasPermission } from '../services/roles/permissions'
import { newJti, storeSession, isSessionValid, revokeSession, revokeAllSessions } from '../services/auth/sessions'

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'
const ACCESS_MAX_AGE_MS = ms(ACCESS_EXPIRES_IN as ms.StringValue)
const REFRESH_MAX_AGE_MS = ms(REFRESH_EXPIRES_IN as ms.StringValue)

const toExpiry = (v: string) => v as unknown as SignOptions['expiresIn']

// Throttle credential endpoints to slow brute-force / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
})

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

// Constant-time-ish guard against user-enumeration by timing: bcrypt.compare is expensive, so
// short-circuiting it when the email doesn't exist makes "unknown email" responses measurably
// faster than "wrong password" ones. Always compare against a hash of the same cost factor.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-constant-time-compare', 10)

type SessionUser = { id: string; email: string; name: string; role: { name: string } }

async function issueSession(res: import('express').Response, user: SessionUser) {
  const jti = newJti()
  const payload = { id: user.id, email: user.email, role: user.role.name }
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: toExpiry(ACCESS_EXPIRES_IN) })
  const refreshToken = jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET!, { expiresIn: toExpiry(REFRESH_EXPIRES_IN) })
  await storeSession(user.id, jti, Math.floor(REFRESH_MAX_AGE_MS / 1000))
  const csrfToken = crypto.randomBytes(32).toString('hex')
  setAuthCookies(res, accessToken, ACCESS_MAX_AGE_MS, refreshToken, REFRESH_MAX_AGE_MS, csrfToken)
}

async function publicUser(user: SessionUser & { id: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: [...(await getPermissions(user.id))],
  }
}

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } })
  const passwordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  if (!user.active) {
    return res.status(403).json({ error: 'Account deactivated' })
  }

  await issueSession(res, user)
  return res.json({ user: await publicUser(user) })
})

router.post('/refresh', authLimiter, async (req, res) => {
  const refreshToken = parseCookieHeader(req.headers.cookie).refresh_token
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' })

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, { algorithms: ['HS256'] }) as {
      id: string; jti: string
    }
    // Перечитываем юзера из БД: деактивированный не может продлить сессию,
    // смена роли подхватывается без re-login (payload токена может быть устаревшим).
    const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { role: true } })
    if (!user || !user.active) {
      clearAuthCookies(res)
      return res.status(401).json({ error: 'Invalid refresh token' })
    }
    if (!(await isSessionValid(user.id, payload.jti))) {
      // jti отсутствует в Redis — токен уже ротирован/отозван. Кто-то предъявляет старый
      // токен повторно (replay украденного refresh) — гасим ВСЕ сессии юзера на всякий случай.
      await revokeAllSessions(user.id)
      clearAuthCookies(res)
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    await revokeSession(user.id, payload.jti) // rotate: старый jti больше не годится
    await issueSession(res, user)
    return res.json({ user: await publicUser(user) })
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', async (req, res) => {
  const refreshToken = parseCookieHeader(req.headers.cookie).refresh_token
  if (refreshToken) {
    try {
      // ignoreExpiration — логаут должен снимать сессию, даже если refresh уже протух.
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      }) as { id: string; jti: string }
      await revokeSession(payload.id, payload.jti)
    } catch {
      // Токен уже невалиден — нечего отзывать, просто чистим cookies ниже.
    }
  }
  clearAuthCookies(res)
  return res.json({ ok: true })
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Пароль должен быть не короче 8 символов')
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Пароль должен содержать буквы и цифры'),
})

router.post('/change-password', authLimiter, authMiddleware, validate(changePasswordSchema), async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return res.status(400).json({ error: 'Текущий пароль указан неверно' })

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
  // Смена пароля обесценивает все выданные сессии, включая текущую — форсируем re-login.
  await revokeAllSessions(user.id)
  clearAuthCookies(res)
  return res.json({ ok: true })
})

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: { select: { name: true } } },
  })
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: [...(await getPermissions(user.id))],
  })
})

// Used for assignee pickers — expose email only to user managers; inactive users excluded.
router.get('/users', authMiddleware, async (req: AuthRequest, res) => {
  const canManage = await userHasPermission(req.user!.id, 'users.manage')
  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      email: canManage,
      role: { select: { name: true, isSystem: true, permissions: true } },
    },
    orderBy: { name: 'asc' },
  })
  return res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      ...(canManage ? { email: (u as { email?: string }).email } : {}),
      role: u.role.name,
      // Для селекта преподавателя в SubscriptionCard (замена фильтра role === 'teacher')
      isTeacher:
        u.role.permissions.includes('lessons.teach') ||
        (u.role.isSystem && u.role.name === 'admin'),
    }))
  )
})

export default router
