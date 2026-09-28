import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { validate } from '../middleware/validate'

const router = Router()
router.use(authMiddleware)

// Custom-field schema management is admin-only; reads stay open to all users.
const adminOnly = requirePermission('settings.crm')

router.get('/', async (req, res) => {
  const { entityType, pipelineId } = req.query
  const where: Record<string, unknown> = {}
  if (entityType) where.entityType = entityType
  if (pipelineId !== undefined) where.pipelineId = pipelineId === 'null' ? null : pipelineId

  const fields = await prisma.fieldDefinition.findMany({
    where,
    orderBy: [{ entityType: 'asc' }, { order: 'asc' }],
  })
  return res.json(fields)
})

const schema = z.object({
  entityType: z.enum(['deal', 'contact', 'company']),
  label: z.string().min(1),
  fieldType: z.enum(['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'textarea']),
  options: z.array(z.object({ value: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  order: z.number().int().default(0),
  required: z.boolean().default(false),
  requiredAtStageIds: z.array(z.string()).optional(),
  pipelineId: z.string().nullable().optional(),
})

// Практическая транслитерация кириллицы — только чтобы системный ключ
// (используется в custom_fields JSONB и прямых SQL-правках, см. CLAUDE.md №1)
// оставался читаемым, а не терялся при вводе русского названия поля.
const translitMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

function slugifyLabel(label: string): string {
  const transliterated = label.toLowerCase().split('').map(ch => translitMap[ch] ?? ch).join('')
  const slug = transliterated.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'field'
}

// Ключ генерируется из label, а не принимается от клиента. При совпадении с уже
// существующим полем (тот же entityType+pipelineId) — добавляется суффикс _1, _2...,
// а вызывающий код предупреждает пользователя (это и есть сигнал «поле-дубль»).
async function generateFieldKey(entityType: string, pipelineId: string | null | undefined, label: string) {
  const base = slugifyLabel(label)
  const scope = pipelineId ?? null
  const existing = await prisma.fieldDefinition.findMany({
    where: { entityType, pipelineId: scope, key: { startsWith: base } },
    select: { key: true },
  })
  const existingKeys = new Set(existing.map(f => f.key))
  if (!existingKeys.has(base)) return { key: base, duplicate: false }
  let n = 1
  while (existingKeys.has(`${base}_${n}`)) n++
  return { key: `${base}_${n}`, duplicate: true }
}

router.post('/', adminOnly, validate(schema), async (req, res) => {
  const { key, duplicate } = await generateFieldKey(req.body.entityType, req.body.pipelineId, req.body.label)
  const field = await prisma.fieldDefinition.create({ data: { ...req.body, key } })
  return res.status(201).json({ ...field, duplicate })
})

router.patch('/:id', adminOnly, validate(schema.partial().strict()), async (req, res) => {
  const field = await prisma.fieldDefinition.update({
    where: { id: req.params.id },
    data: req.body,
  })
  return res.json(field)
})

router.delete('/:id', adminOnly, async (req, res) => {
  await prisma.fieldDefinition.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

export default router
