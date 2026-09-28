export interface CreateLinkInput {
  payment: {
    id: string
    /** Числовой инвойс (Payment.invoiceId) — общий идентификатор для провайдера */
    invoiceId: number
    /** Строка с точкой и двумя знаками, напр. "8000.00" — от неё же считаются подписи */
    amount: string
    currency: string
  }
  description: string
  email?: string | null
  phone?: string | null
}

/** Провайдер сам знает формат подтверждения: CP — JSON {"code":0}, Робокасса — text OK{InvId} */
interface WebhookAck {
  status: number
  contentType: string
  body: string
}

export type WebhookResult =
  | { ok: true; invoiceId: number; externalId: string | null; amount: string | null; ack: WebhookAck }
  | { ok: false; reason: string; nack: WebhookAck }

export interface PaymentProvider {
  name: string
  createLink(input: CreateLinkInput): Promise<{ url: string }>
  handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookResult>
}

/** Payment.amount (Prisma Decimal) → строка формата провайдеров "1234.00" */
export function formatAmount(amount: unknown): string {
  return Number(amount).toFixed(2)
}
