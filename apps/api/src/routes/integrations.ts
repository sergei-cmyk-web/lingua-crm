import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, requirePermission, type AuthRequest } from '../middleware/auth'
import { userHasPermission } from '../services/roles/permissions'
import { wazzupClient } from '../services/wazzup/client'
import { targetSmsClient } from '../services/sms/client'
import { invalidatePaymentSettingsCache } from '../services/payments'

const router = Router()
router.use(authMiddleware)

// Не гейтим правом settings.integrations: список каналов — операционные данные, нужны любому
// менеджеру для выбора канала при отправке (NewMessageDialog/DealDetail/чаты), не только админу.
router.get('/wazzup/channels', async (_req, res, next) => {
  try {
    const setting = await prisma.integrationSetting.findUnique({ where: { key: 'wazzup_channels' } })
    const channels = setting ? JSON.parse(setting.value) : []
    return res.json({ channels, hasApiKey: !!process.env.WAZZUP_API_KEY })
  } catch (err) {
    return next(err)
  }
})

// Generic key-value настройки интеграций. Только allowlist-ключи;
// секреты не возвращаются в GET — только факт наличия.
const SETTING_KEYS = new Set([
  'trial_reminders',
  'targetsms_login',
  'targetsms_password',
  'targetsms_sender',
  'lead_form',
  'payments',
  'cloudpayments_public_id',
  'cloudpayments_api_secret',
  'robokassa_login',
  'robokassa_password1',
  'robokassa_password2',
])
// Секреты write-only: GET отдаёт только hasValue даже тем, у кого есть право (как targetsms_password)
const WRITE_ONLY_KEYS = new Set(['targetsms_password', 'cloudpayments_api_secret', 'robokassa_password1', 'robokassa_password2'])
// Единственный ключ, который читают НЕ со страницы настроек: InvoiceDialog (любой менеджер,
// нужен provider/шаблон при выставлении счёта). Остальные ключи — конфиг, значение видит
// только тот, кто вправе эту интеграцию настраивать (A10 — раньше любой залогиненный видел
// значения login/секретов/шаблонов через этот роут, даже без права на настройки).
const OPERATIONAL_KEYS = new Set(['payments'])

// A14: 'value' для lead_form/payments — сериализованный JSON, который читают JSON.parse без try/catch
// в других местах (напр. leads.ts — публичный, неаутентифицированный роут). Валидировать форму здесь,
// на записи (admin-only), а не защищаться JSON.parse-обёртками на каждом месте чтения.
const JSON_SETTING_SCHEMAS: Partial<Record<string, z.ZodTypeAny>> = {
  lead_form: z.object({
    secret: z.string().optional(),
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
  }).strict(),
  payments: z.object({
    defaultProvider: z.enum(['cloudpayments', 'robokassa']).optional(),
    robokassaTestMode: z.boolean().optional(),
    paidStageMap: z.record(z.string(), z.string()).optional(),
    invoiceMessageTemplate: z.string().optional(),
  }).strict(),
}

router.get('/settings/:key', async (req, res, next) => {
  try {
    const { key } = req.params
    if (!SETTING_KEYS.has(key)) return res.status(404).json({ error: 'Unknown setting' })

    const setting = await prisma.integrationSetting.findUnique({ where: { key } })
    // Пароли не возвращаем никому — только факт наличия
    if (WRITE_ONLY_KEYS.has(key)) return res.json({ key, hasValue: !!setting?.value })
    if (!OPERATIONAL_KEYS.has(key)) {
      const perm = key === 'trial_reminders' ? ('settings.crm' as const) : ('settings.integrations' as const)
      const userId = (req as AuthRequest).user!.id
      if (!(await userHasPermission(userId, perm))) {
        return res.json({ key, hasValue: !!setting?.value })
      }
    }
    return res.json({ key, value: setting?.value ?? null })
  } catch (err) {
    return next(err)
  }
})

router.put('/settings/:key', async (req, res, next) => {
  try {
    const { key } = req.params
    if (!SETTING_KEYS.has(key)) return res.status(404).json({ error: 'Unknown setting' })

    // trial_reminders настраивается на /settings/trials (CRM-группа), остальные ключи — интеграции
    const perm = key === 'trial_reminders' ? ('settings.crm' as const) : ('settings.integrations' as const)
    if (!(await userHasPermission((req as AuthRequest).user!.id, perm))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { value } = req.body
    if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' })

    const jsonSchema = JSON_SETTING_SCHEMAS[key]
    if (jsonSchema) {
      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        return res.status(400).json({ error: 'value must be valid JSON' })
      }
      const result = jsonSchema.safeParse(parsed)
      if (!result.success) {
        return res.status(400).json({ error: 'Некорректный формат настройки', details: result.error.flatten().fieldErrors })
      }
    }

    await prisma.integrationSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
    if (key.startsWith('targetsms_')) targetSmsClient.invalidateCache()
    if (key === 'payments' || key.startsWith('cloudpayments_') || key.startsWith('robokassa_')) {
      invalidatePaymentSettingsCache()
    }

    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

router.post('/targetsms/test', requirePermission('settings.integrations'), async (_req, res, next) => {
  try {
    const balance = await targetSmsClient.getBalance()
    return res.json({ ok: true, balance })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка проверки TargetSMS'
    return res.status(400).json({ ok: false, error: message })
  }
})

// Шаблоны SMS из личного кабинета TargetSMS — открыто всем залогиненным (нужно менеджерам
// при отправке SMS из карточки сделки, не только админам).
router.get('/targetsms/templates', async (_req, res, next) => {
  try {
    const templates = await targetSmsClient.getTemplates()
    return res.json({ templates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка получения шаблонов TargetSMS'
    return res.status(400).json({ error: message })
  }
})

router.post('/wazzup/sync', requirePermission('settings.integrations'), async (_req, res, next) => {
  try {
    if (!process.env.WAZZUP_API_KEY) {
      return res.status(400).json({ error: 'WAZZUP_API_KEY не настроен на сервере' })
    }

    const data = await wazzupClient.getChannels()
    // WazzUp may return { channels: [...] } or just an array
    const channels: unknown[] = Array.isArray(data) ? data : (data?.channels ?? [])

    await prisma.integrationSetting.upsert({
      where: { key: 'wazzup_channels' },
      update: { value: JSON.stringify(channels) },
      create: { key: 'wazzup_channels', value: JSON.stringify(channels) },
    })

    return res.json({ channels })
  } catch (err) {
    return next(err)
  }
})

export default router
