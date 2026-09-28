import axios from 'axios'
import crypto from 'crypto'
import querystring from 'querystring'
import { getPaymentSettings } from './settings'
import type { CreateLinkInput, PaymentProvider, WebhookResult } from './types'

// CloudPayments: счёт через Orders API, Pay-уведомление подписывается HMAC-SHA256
// от СЫРОГО тела (base64) в заголовке Content-HMAC. Тело по умолчанию form-urlencoded.
// Docs: https://developers.cloudpayments.ru/#sozdanie-scheta-dlya-otpravki-po-pochte
export const cloudPaymentsProvider: PaymentProvider = {
  name: 'cloudpayments',

  async createLink(input: CreateLinkInput) {
    const settings = await getPaymentSettings()
    if (!settings.cloudpayments) {
      throw new Error('CloudPayments не настроен — заполните Public ID и API Secret в Настройки → Оплата')
    }
    const { publicId, apiSecret } = settings.cloudpayments

    const response = await axios.post(
      'https://api.cloudpayments.ru/orders/create',
      {
        Amount: Number(input.payment.amount),
        Currency: input.payment.currency,
        Description: input.description,
        InvoiceId: String(input.payment.invoiceId),
        ...(input.email ? { Email: input.email } : {}),
        ...(input.phone ? { Phone: input.phone } : {}),
        JsonData: { paymentId: input.payment.id },
      },
      {
        auth: { username: publicId, password: apiSecret },
        timeout: 10_000,
      }
    )

    if (response.data?.Success !== true || !response.data?.Model?.Url) {
      throw new Error(`CloudPayments: ${response.data?.Message ?? 'не удалось создать счёт'}`)
    }
    return { url: String(response.data.Model.Url) }
  },

  async handleWebhook(rawBody, headers): Promise<WebhookResult> {
    const nack = { status: 401, contentType: 'application/json', body: '{"code":13}' }
    const settings = await getPaymentSettings()
    if (!settings.cloudpayments) return { ok: false, reason: 'CloudPayments не настроен', nack }

    const headerValue = headers['content-hmac'] ?? headers['x-content-hmac']
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue
    if (!signature) return { ok: false, reason: 'Нет заголовка Content-HMAC', nack }

    const expected = crypto
      .createHmac('sha256', settings.cloudpayments.apiSecret)
      .update(rawBody)
      .digest('base64')
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: 'Неверная подпись Content-HMAC', nack }
    }

    // Тело: form-urlencoded по умолчанию, JSON — если переключено в ЛК
    const contentTypeHeader = headers['content-type']
    const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader) ?? ''
    let payload: Record<string, unknown>
    try {
      payload = contentType.includes('json')
        ? JSON.parse(rawBody.toString('utf8'))
        : { ...querystring.parse(rawBody.toString('utf8')) }
    } catch {
      return { ok: false, reason: 'Не удалось разобрать тело вебхука', nack: { ...nack, status: 400 } }
    }

    const invoiceId = Number(payload.InvoiceId)
    if (!Number.isInteger(invoiceId)) {
      return { ok: false, reason: `Некорректный InvoiceId: ${payload.InvoiceId}`, nack: { ...nack, status: 400 } }
    }

    return {
      ok: true,
      invoiceId,
      externalId: payload.TransactionId != null ? String(payload.TransactionId) : null,
      amount: payload.Amount != null ? String(payload.Amount) : null,
      // Ответ {"code":0} обязателен — иначе CP считает уведомление недоставленным и ретраит
      ack: { status: 200, contentType: 'application/json', body: '{"code":0}' },
    }
  },
}
