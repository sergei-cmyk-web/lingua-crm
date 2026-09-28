import { cloudPaymentsProvider } from './cloudpayments'
import { robokassaProvider } from './robokassa'
import type { PaymentProvider } from './types'

export { getPaymentSettings, invalidatePaymentSettingsCache } from './settings'
export { formatAmount } from './types'

export const PAYMENT_PROVIDERS = ['cloudpayments', 'robokassa'] as const
type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number]

const providers: Record<PaymentProviderName, PaymentProvider> = {
  cloudpayments: cloudPaymentsProvider,
  robokassa: robokassaProvider,
}

export function getProvider(name: string): PaymentProvider | null {
  return (providers as Record<string, PaymentProvider>)[name] ?? null
}
