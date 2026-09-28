import { wazzupClient } from '../wazzup/client'
import { targetSmsClient } from '../sms/client'

// Единая точка исходящей отправки: 'sms' → TargetSMS, остальные транспорты → WazzUp.
// В отличие от прямого wazzupClient.sendMessage, «тихий» null (нет ключа/канала)
// превращается в ошибку — вызывающий код фиксирует её в Message.errorMsg.
export async function sendViaTransport({
  transport,
  chatId,
  text,
  recipientType,
}: {
  transport: string
  chatId: string
  text: string
  recipientType?: 'chatId' | 'phone' | 'username'
}): Promise<{ externalId?: string | null; channelId?: string | null }> {
  if (transport === 'sms') {
    const result = await targetSmsClient.sendSms({ phone: chatId, text })
    return { externalId: result.idSms, channelId: null }
  }

  const result = await wazzupClient.sendMessage({ chatId, message: text, channel: transport, recipientType })
  if (result === null) {
    throw new Error(`WazzUp не настроен или нет активного канала «${transport}»`)
  }
  const wazzupResult = result as { messageId?: string; channelId?: string } | null
  return { externalId: wazzupResult?.messageId ?? null, channelId: wazzupResult?.channelId ?? null }
}
