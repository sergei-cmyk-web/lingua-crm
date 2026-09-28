import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { invalidatePermissionsCache } from '../services/roles/permissions'

const router = Router()
router.use(authMiddleware, requirePermission('users.manage'))

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
}

// Все пользователи, включая деактивированных (в отличие от пикеров GET /auth/users)
router.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })
    return res.json(users)
  } catch (err) {
    return next(err)
  }
})

const createSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    roleId: z.string().min(1),
  })
  .strict()

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { name, email, password, roleId } = req.body
    const user = await prisma.user.create({
      data: { name, email, roleId, passwordHash: await bcrypt.hash(password, 10) },
      select: USER_SELECT,
    })
    invalidatePermissionsCache()
    return res.status(201).json(user)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
    }
    return next(err)
  }
})

// Сброс пароля — тот же PATCH (админ задаёт новый пароль напрямую)
const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    roleId: z.string().min(1).optional(),
    active: z.boolean().optional(),
    password: z.string().min(6).optional(),
  })
  .strict()

router.patch('/:id', validate(patchSchema), async (req: AuthRequest, res, next) => {
  try {
    const { password, ...rest } = req.body
    if (rest.active === false && req.params.id === req.user!.id) {
      return res.status(400).json({ error: 'Нельзя деактивировать себя' })
    }
    const data: Record<string, unknown> = { ...rest }
    if (password) data.passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: USER_SELECT,
    })
    invalidatePermissionsCache()
    return res.json(user)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') return res.status(404).json({ error: 'Not found' })
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' })
    }
    return next(err)
  }
})

// DELETE нет намеренно: на юзере FK от сделок/задач — вместо удаления деактивация

export default router
