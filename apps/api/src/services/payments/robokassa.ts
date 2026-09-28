import crypto from 'crypto'
import querystring from 'querystring'
import { getPaymentSettings } from './settings'
import type { CreateLinkInput, PaymentProvider, WebhookResult } from './types'

// Робокасса: ссылка — просто URL с MD5-подписью (без HTTP-вызова),
// ResultURL — POST form-urlencoded с подписью от Password2.
// InvId строго числовой. Подпись считается от ТОЙ ЖЕ строки OutSum, что ушла в URL.
// Docs: https://docs.robokassa.ru/pay-interface/

function md5(s: string) {
  return crypto.createHash('md5').update(s).digest('hex')
}

export const robokassaProvider: PaymentProvider = {
  name: 'robokassa',

  async createLink(input: CreateLinkInput) {
    const settings = await getPaymentSettings()
    if (!settings.robokassa) {
      throw new Error('Робокасса не настроена — заполните логин и пароли в Настройки → Оплата')
    }
    const { login, password1 } = settings.robokassa
    const outSum = input.payment.amount // уже "1234.00"
    const invId = String(input.payment.invoiceId)
    const signature = md5(`${login}:${outSum}:${invId}:${password1}`)

    const params = new URLSearchParams({
      MerchantLogin: login,
      OutSum: outSum,
      InvId: invId,
      Description: input.description,
      SignatureValue: signature,
      ...(input.email ? { Email: input.email } : {}),
      ...(settings.config.robokassaTestMode ? { IsTest: '1' } : {}),
    })
    return { url: `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}` }
  },

  async handleWebhook(rawBody, _headers): Promise<WebhookResult> {
    const nack = { status: 401, contentType: 'text/plain', body: 'bad sign' }
    const settings = await getPaymentSettings()
    if (!settings.robokassa) return { ok: false, reason: 'Робокасса не настроена', nack }

    const payload = querystring.parse(rawBody.toString('utf8'))
    const outSum = typeof payload.OutSum === 'string' ? payload.OutSum : ''
    const invIdRaw = typeof payload.InvId === 'string' ? payload.InvId : ''
    const signature = typeof payload.SignatureValue === 'string' ? payload.SignatureValue : ''

    const invoiceId = Number(invIdRaw)
    if (!outSum || !signature || !Number.isInteger(invoiceId)) {
      return { ok: false, reason: 'Нет OutSum/InvId/SignatureValue', nack: { ...nack, status: 400, body: 'bad request' } }
    }

    // Подпись регистронезависима — нормализуем в lower перед сравнением
    const expected = md5(`${outSum}:${invIdRaw}:${settings.robokassa.password2}`).toLowerCase()
    const received = signature.toLowerCase()
    const expBuf = Buffer.from(expected)
    const recBuf = Buffer.from(received)
    if (expBuf.length !== recBuf.length || !crypto.timingSafeEqual(expBuf, recBuf)) {
      return { ok: false, reason: 'Неверная подпись ResultURL', nack }
    }

    return {
      ok: true,
      invoiceId,
      externalId: null,
      amount: outSum,
      // Робокасса требует ровно "OK{InvId}" — иначе будет ретраить уведомление
      ack: { status: 200, contentType: 'text/plain', body: `OK${invIdRaw}` },
    }
  },
}
