import axios from 'axios'
import { prisma } from '../../lib/prisma'
import { phoneDigits } from '../../lib/phone'

// TargetSMS (СМС Таргет) JSON API: https://targetsms.ru/otpravka-sms-v-json
const API_URL = 'https://sms.targetsms.ru/sendsmsjson.php'

interface SmsCredentials {
  login: string
  password: string
  sender: string
}

class TargetSmsClient {
  private cache: { creds: SmsCredentials | null; at: number } = { creds: null, at: 0 }

  // Креды живут в IntegrationSetting — кэш на минуту, чтобы не бить БД на каждое SMS
  private async getCredentials(): Promise<SmsCredentials | null> {
    if (Date.now() - this.cache.at < 60_000) return this.cache.creds

    const settings = await prisma.integrationSetting.findMany({
      where: { key: { in: ['targetsms_login', 'targetsms_password', 'targetsms_sender'] } },
    })
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const creds =
      map.targetsms_login && map.targetsms_password && map.targetsms_sender
        ? { login: map.targetsms_login, password: map.targetsms_password, sender: map.targetsms_sender }
        : null

    this.cache = { creds, at: Date.now() }
    return creds
  }

  invalidateCache() {
    this.cache = { creds: null, at: 0 }
  }

  async sendSms({ phone, text }: { phone: string; text: string }): Promise<{ idSms: string; parts: number }> {
    const creds = await this.getCredentials()
    if (!creds) {
      throw new Error('TargetSMS не настроен — заполните логин, пароль и имя отправителя в Настройки → SMS')
    }

    const digits = phoneDigits(phone)
    if (!digits) throw new Error('Пустой номер телефона для SMS')

    const response = await axios.post(
      API_URL,
      {
        security: { login: creds.login, password: creds.password },
        type: 'sms',
        message: [
          {
            type: 'sms',
            sender: creds.sender,
            text,
            abonent: [{ phone: digits, number_sms: '1' }],
          },
        ],
      },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )

    // Ответ: { sms: [{ number_sms, id_sms, parts, action: 'send' | <текст ошибки> }] }
    const sms = response.data?.sms?.[0]
    if (!sms || sms.action !== 'send') {
      throw new Error(sms?.action ? `TargetSMS: ${sms.action}` : 'TargetSMS: некорректный ответ сервиса')
    }
    return { idSms: String(sms.id_sms), parts: Number(sms.parts) || 1 }
  }

  // Шаблоны SMS, настроенные в личном кабинете TargetSMS (list_patterns) — используются
  // менеджером как быстрый выбор текста при отправке из карточки сделки, вместо ручного набора.
  async getTemplates(): Promise<{ id: string; name: string; text: string }[]> {
    const creds = await this.getCredentials()
    if (!creds) {
      throw new Error('TargetSMS не настроен — заполните логин, пароль и имя отправителя')
    }
    const response = await axios.post(
      API_URL,
      { security: { login: creds.login, password: creds.password }, type: 'list_patterns' },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
    const patterns = response.data?.patterns ?? []
    return patterns.map((p: { id_pattern: string; name: string; pattern: string }) => ({
      id: String(p.id_pattern),
      name: p.name,
      text: p.pattern,
    }))
  }

  async getBalance(): Promise<{ currency: string; value: string }> {
    const creds = await this.getCredentials()
    if (!creds) {
      throw new Error('TargetSMS не настроен — заполните логин, пароль и имя отправителя')
    }
    const response = await axios.post(
      API_URL,
      { security: { login: creds.login, password: creds.password }, type: 'balance' },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
    const money = response.data?.money
    if (!money) throw new Error('TargetSMS: не удалось получить баланс — проверьте логин и пароль')
    return { currency: String(money.currency ?? 'RUR'), value: String(money.value ?? '0') }
  }
}

export const targetSmsClient = new TargetSmsClient()
