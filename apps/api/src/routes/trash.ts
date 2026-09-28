import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { emitToRoom } from '../socket/handlers'
import { dealInclude } from './deals'

// Корзина: мягко удалённые сделки/контакты/компании (deletedAt != null).
// Восстановление и окончательное удаление — только админ; автоочистка через 30 дней.
const router = Router()
router.use(authMiddleware, requirePermission('trash.manage'))

const TRASH_RETENTION_DAYS = 30

router.get('/', async (_req, res, next) => {
  try {
    const inTrash = { deletedAt: { not: null } }
    const [deals, contacts, companies] = await Promise.all([
      prisma.deal.findMany({
        where: inTrash,
        select: {
          id: true,
          title: true,
          budget: true,
          deletedAt: true,
          stage: { select: { name: true, color: true } },
          pipeline: { select: { name: true } },
          contact: { select: { id: true, name: true } },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.contact.findMany({
        where: inTrash,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          deletedAt: true,
          _count: { select: { deals: { where: { deletedAt: null } } } },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.company.findMany({
        where: inTrash,
        select: {
          id: true,
          name: true,
          deletedAt: true,
          _count: { select: { contacts: { where: { deletedAt: null } }, deals: { where: { deletedAt: null } } } },
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ])
    return res.json({ deals, contacts, companies, retentionDays: TRASH_RETENTION_DAYS })
  } catch (err) {
    return next(err)
  }
})

router.post('/deals/:id/restore', async (req, res, next) => {
  try {
    const { count } = await prisma.deal.updateMany({
      where: { id: req.params.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) return res.status(404).json({ error: 'Сделка не найдена в корзине' })
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: dealInclude })
    emitToRoom(`pipeline:${deal!.pipelineId}`, 'DEAL_CREATED', deal)
    return res.json(deal)
  } catch (err) {
    return next(err)
  }
})

router.post('/contacts/:id/restore', async (req, res, next) => {
  try {
    const { count } = await prisma.contact.updateMany({
      where: { id: req.params.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) return res.status(404).json({ error: 'Контакт не найден в корзине' })
    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

router.post('/companies/:id/restore', async (req, res, next) => {
  try {
    const { count } = await prisma.company.updateMany({
      where: { id: req.params.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) return res.status(404).json({ error: 'Компания не найдена в корзине' })
    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

// Окончательное удаление из корзины; активные записи (deletedAt = null) этим роутом не удалить
router.delete('/deals/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.deal.deleteMany({ where: { id: req.params.id, deletedAt: { not: null } } })
    if (count === 0) return res.status(404).json({ error: 'Сделка не найдена в корзине' })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

router.delete('/contacts/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.contact.deleteMany({ where: { id: req.params.id, deletedAt: { not: null } } })
    if (count === 0) return res.status(404).json({ error: 'Контакт не найден в корзине' })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

router.delete('/companies/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.company.deleteMany({ where: { id: req.params.id, deletedAt: { not: null } } })
    if (count === 0) return res.status(404).json({ error: 'Компания не найдена в корзине' })
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
})

/** Стирает из корзины всё, что лежит там дольше TRASH_RETENTION_DAYS. */
async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = { deletedAt: { lt: cutoff } }
  const [deals, contacts, companies] = await prisma.$transaction([
    prisma.deal.deleteMany({ where: expired }),
    prisma.contact.deleteMany({ where: expired }),
    prisma.company.deleteMany({ where: expired }),
  ])
  const total = deals.count + contacts.count + companies.count
  if (total > 0) {
    console.log(`[trash] автоочистка: сделок ${deals.count}, контактов ${contacts.count}, компаний ${companies.count}`)
  }
}

// Чистим при старте и раз в 12 часов; без Redis — обычный setInterval внутри процесса.
// Прогон при старте догоняет пропущенное после рестарта/деплоя.
export function startTrashPurge() {
  purgeExpiredTrash().catch(err => console.error('[trash] ошибка автоочистки:', err))
  setInterval(
    () => purgeExpiredTrash().catch(err => console.error('[trash] ошибка автоочистки:', err)),
    12 * 60 * 60 * 1000
  ).unref()
}

export default router
