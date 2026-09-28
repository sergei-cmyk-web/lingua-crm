import { Router } from 'express'
import { z } from 'zod'
import { ALL_PERMISSIONS } from '@crm/shared'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { invalidatePermissionsCache } from '../services/roles/permissions'

const router = Router()
router.use(authMiddleware, requirePermission('users.manage'))

router.get('/', async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    })
    return res.json(
      roles.map(({ _count, ...r }) => ({ ...r, usersCount: _count.users }))
    )
  } catch (err) {
    return next(err)
  }
})

const permissionsSchema = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))

const createSchema = z.object({ name: z.string().min(1), permissions: permissionsSchema }).strict()

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const role = await prisma.role.create({
      data: { name: req.body.name, permissions: req.body.permissions, isSystem: false },
    })
    invalidatePermissionsCache()
    return res.status(201).json(role)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Роль с таким названием уже существует' })
    }
    return next(err)
  }
})

const patchSchema = createSchema.partial()

router.patch('/:id', validate(patchSchema), async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } })
    if (!role) return res.status(404).json({ error: 'Not found' })
    // Системный admin неприкосновенен (все права даются из кода); у остальных
    // системных ролей можно менять права, но не имя (seed/скрипты матчат по имени)
    if (role.isSystem && role.name === 'admin') {
      return res.status(403).json({ error: 'Системную роль admin менять нельзя' })
    }
    if (role.isSystem && req.body.name && req.body.name !== role.name) {
      return res.status(403).json({ error: 'Системную роль нельзя переименовать' })
    }
    const updated = await prisma.role.update({ where: { id: role.id }, data: req.body })
    invalidatePermissionsCache()
    return res.json(updated)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Роль с таким названием уже существует' })
    }
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    })
    if (!role) return res.status(404).json({ error: 'Not found' })
    if (role.isSystem) return res.status(403).json({ error: 'Системную роль удалить нельзя' })
    if (role._count.users > 0) {
      return res.status(409).json({ error: 'role_in_use', usersCount: role._count.users })
    }
    await prisma.role.delete({ where: { id: role.id } })
    invalidatePermissionsCache()
    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
