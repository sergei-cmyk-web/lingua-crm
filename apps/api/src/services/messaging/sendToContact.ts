import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'
import { sendViaTransport } from './send'

interface ContactForSend {
  id: string
  phone: string | null
  wazzupChatId: string | null
  channels: { transport: string; chatId: string }[]
}

type RecipientType = 'chatId' | 'phone' | 'username'

/**
 * Резолв chatId/recipientType для отправки. Только Telegram Personal/MAX (tgapi/max) умеют
 * резолвить чат по номеру телефона через отдельное поле phone/username — chatId с угаданным
 * значением (голые цифры телефона) WazzUp принимает, но реальный чат не создаёт
 * (см. CLAUDE.md замечание 49).
 */
export function resolveRecipient({
  transport,
  contact,
  explicitChatId,
  explicitRecipientType,
}: {
  transport: string
  contact: ContactForSend | null
  explicitChatId?: string | null
  explicitRecipientType?: RecipientType
}): { chatId: string | null; recipientType: RecipientType } {
  const supportsPhoneLookup = transport === 'tgapi' || transport === 'max'
  const establishedChatId =
    contact?.channels?.find(c => c.transport === transport)?.chatId ?? contact?.wazzupChatId ?? null

  if (explicitChatId) {
    return {
      chatId: explicitChatId,
      recipientType:
        supportsPhoneLookup && (explicitRecipientType === 'phone' || explicitRecipientType === 'username')
          ? explicitRecipientType
          : 'chatId',
    }
  }
  if (establishedChatId) return { chatId: establishedChatId, recipientType: 'chatId' }
  if (contact?.phone) {
    return { chatId: contact.phone.replace(/\D/g, ''), recipientType: supportsPhoneLookup ? 'phone' : 'chatId' }
  }
  return { chatId: null, recipientType: 'chatId' }
}

/**
 * Общая немедленная отправка мессенджер-сообщения (не email, не отложенная отправка):
 * создаёт Message, эмитит сокеты во все релевантные комнаты (deal/pipeline, если известны,
 * плюс contact:{id}/chats:inbox для раздела «Чаты»), шлёт через sendViaTransport и обновляет статус.
 * Используется и `POST /deals/:id/messages`, и `POST /chats/:contactId/messages`.
 */
export async function sendMessageToContact({
  contact,
  dealId,
  pipelineId,
  transport,
  text,
  explicitChatId,
  explicitRecipientType,
}: {
  contact: ContactForSend | null
  dealId: string | null
  pipelineId: string | null
  transport: string
  text: string
  explicitChatId?: string | null
  explicitRecipientType?: RecipientType
}) {
  const { chatId, recipientType } = resolveRecipient({ transport, contact, explicitChatId, explicitRecipientType })

  const message = await prisma.message.create({
    data: {
      dealId,
      contactId: contact?.id ?? null,
      channel: transport,
      chatId,
      direction: 'out',
      content: text,
      status: chatId ? 'sending' : 'error',
      errorMsg: chatId ? null : 'Не задан получатель — укажите телефон или мессенджер контакта',
    },
  })

  const rooms = ['chats:inbox']
  if (contact) rooms.push(`contact:${contact.id}`)
  if (dealId) rooms.push(`deal:${dealId}`)
  if (pipelineId) rooms.push(`pipeline:${pipelineId}`)
  for (const room of rooms) emitToRoom(room, 'NEW_MESSAGE', { dealId, message })

  const emitStatus = (status: string, extra?: object) => {
    const payload = { dealId, messageId: message.id, status, ...extra }
    for (const room of rooms) emitToRoom(room, 'MESSAGE_STATUS', payload)
  }

  if (chatId) {
    sendViaTransport({ transport, chatId, text, recipientType })
      .then(async ({ externalId, channelId }) => {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'sent', wazzupId: transport === 'sms' ? null : externalId ?? null, channelId: channelId ?? null },
        })
        emitStatus('sent', { wazzupId: externalId })
      })
      .catch(async (err: unknown) => {
        const axErr = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
        const errorMsg =
          axErr.response?.data?.message ?? axErr.response?.data?.error ?? (err instanceof Error ? err.message : 'Ошибка отправки')
        await prisma.message.update({ where: { id: message.id }, data: { status: 'error', errorMsg } })
        emitStatus('error', { errorMsg })
      })
  }

  return message
}
