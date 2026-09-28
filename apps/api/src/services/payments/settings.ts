import { prisma } from '../../lib/prisma'

const KEYS = [
  'payments',
  'cloudpayments_public_id',
  'cloudpayments_api_secret',
  'robokassa_login',
  'robokassa_password1',
  'robokassa_password2',
] as const

interface PaymentsConfig {
  defaultProvider?: 'cloudpayments' | 'robokassa'
  robokassaTestMode?: boolean
  /** pipelineId → stageId этапа «Оплачено»; фолбэк — первый won-этап воронки */
  paidStageMap?: Record<string, string>
}

interface PaymentSettings {
  config: PaymentsConfig
  cloudpayments: { publicId: string; apiSecret: string } | null
  robokassa: { login: string; password1: string; password2: string } | null
}

// Кэш на минуту по образцу targetSmsClient; сбрасывается в PUT /integrations/settings/:key
let cache: { value: PaymentSettings | null; at: number } = { value: null, at: 0 }

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (cache.value && Date.now() - cache.at < 60_000) return cache.value

  const rows = await prisma.integrationSetting.findMany({ where: { key: { in: [...KEYS] } } })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  let config: PaymentsConfig = {}
  try {
    config = map.payments ? JSON.parse(map.payments) : {}
  } catch {
    console.error('[payments] Некорректный JSON в настройке payments')
  }

  const value: PaymentSettings = {
    config,
    cloudpayments:
      map.cloudpayments_public_id && map.cloudpayments_api_secret
        ? { publicId: map.cloudpayments_public_id, apiSecret: map.cloudpayments_api_secret }
        : null,
    robokassa:
      map.robokassa_login && map.robokassa_password1 && map.robokassa_password2
        ? { login: map.robokassa_login, password1: map.robokassa_password1, password2: map.robokassa_password2 }
        : null,
  }
  cache = { value, at: Date.now() }
  return value
}

export function invalidatePaymentSettingsCache() {
  cache = { value: null, at: 0 }
}
