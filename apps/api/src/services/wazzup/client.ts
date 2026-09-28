import axios from 'axios'
import { prisma } from '../../lib/prisma'

const BASE_URL = 'https://api.wazzup24.com/v3'

interface WazzupChannel {
  channelId: string
  transport: string
  plainId: string
  state: string
}

interface SendMessageParams {
  chatId: string
  message: string
  channel: 'whatsapp' | 'telegram' | 'tgapi' | 'instagram' | 'max' | 'maxbot' | string
  // 'chatId' — известный chatId из истории переписки (пришёл в вебхуке входящего сообщения).
  // 'phone'/'username' — холодная отправка (Telegram Personal/MAX умеют резолвить чат по номеру
  // телефона или @username через отдельные поля запроса — chatId с "угаданным" значением
  // (например голыми цифрами телефона) WazzUp принимает (200/201, свой messageId), но реального
  // Telegram-чата не создаёт, т.к. не запускает свой резолвинг номера. См. доку
  // https://wazzup24.ru/help/api-ru/otpravka-soobshhenij/
  recipientType?: 'chatId' | 'phone' | 'username'
}

// Наши внутренние транспорты (различают личный Telegram-аккаунт/бота, см. замечание 14)
// не всегда совпадают со значениями chatType, которые понимает сам WazzUp API —
// разница между личным аккаунтом и ботом там определяется через channelId, не через chatType.
const CHAT_TYPE_MAP: Record<string, string> = {
  tgapi: 'telegram',
  maxbot: 'max',
}

class WazzupClient {
  private get headers() {
    return {
      Authorization: `Bearer ${process.env.WAZZUP_API_KEY}`,
      'Content-Type': 'application/json',
    }
  }

  private async resolveChannelId(transport: string): Promise<string | null> {
    // 1. Try synced channels in DB
    const setting = await prisma.integrationSetting.findUnique({ where: { key: 'wazzup_channels' } })
    if (setting) {
      const channels: WazzupChannel[] = JSON.parse(setting.value)
      const match = channels.find(c => c.transport === transport && c.state === 'active')
      if (match) return match.channelId
    }

    // 2. Fall back to legacy env var (backwards compat)
    if (process.env.WAZZUP_CHANNEL_ID) return process.env.WAZZUP_CHANNEL_ID

    return null
  }

  async sendMessage({ chatId, message, channel, recipientType = 'chatId' }: SendMessageParams) {
    if (!process.env.WAZZUP_API_KEY) {
      throw new Error('WazzUp API key не настроен на сервере')
    }

    const channelId = await this.resolveChannelId(channel)
    if (!channelId) {
      throw new Error(`Канал «${channel}» не подключён или не активен в WazzUp — синхронизируйте каналы в Настройки → WazzUp`)
    }

    // For WhatsApp, chatId is a phone — strip non-digits; for others use as-is
    const normalizedChatId = channel === 'whatsapp' ? chatId.replace(/\D/g, '') : chatId
    const payload = {
      channelId,
      chatType: CHAT_TYPE_MAP[channel] ?? channel,
      text: message,
      [recipientType]: normalizedChatId,
    }

    // payload содержит получателя и текст сообщения — логируем только по явному флагу
    const logBody = process.env.LOG_WAZZUP_BODY === 'true'
    if (logBody) console.log('[wazzup] sendMessage request:', `${BASE_URL}/message`, JSON.stringify(payload))
    try {
      const response = await axios.post(`${BASE_URL}/message`, payload, { headers: this.headers })
      if (logBody) console.log('[wazzup] sendMessage response:', response.status, JSON.stringify(response.data))
      return { ...response.data, channelId }
    } catch (err) {
      const axErr = err as { response?: { status?: number; data?: unknown } }
      console.error('[wazzup] sendMessage error:', axErr.response?.status, JSON.stringify(axErr.response?.data))
      throw err
    }
  }

  async editMessage(wazzupId: string, channel: string, text: string) {
    if (!process.env.WAZZUP_API_KEY) return null
    const channelId = await this.resolveChannelId(channel)
    if (!channelId) return null
    const response = await axios.patch(
      `${BASE_URL}/message`,
      { messageId: wazzupId, channelId, text },
      { headers: this.headers }
    )
    return response.data
  }

  async getChannels() {
    const response = await axios.get(`${BASE_URL}/channels`, { headers: this.headers })
    return response.data
  }
}

export const wazzupClient = new WazzupClient()
