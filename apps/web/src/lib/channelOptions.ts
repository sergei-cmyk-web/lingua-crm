import { TRANSPORT_LABELS, TRANSPORT_EMOJI } from '@crm/shared'

export interface ChannelTarget {
  transport: string
  chatId: string
}

export type ChannelOption = ChannelTarget & { key: string; label: string }

export interface ChannelContact {
  phone?: string | null
  phones?: { id: string; phone: string; label?: string | null }[]
  channels: { transport: string; chatId: string }[]
  email?: string | null
  emails?: { id: string; email: string; label?: string | null }[]
}

export const channelKey = (t: ChannelTarget) => `${t.transport}|${t.chatId}`

function phoneToChatId(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits
}

export function transportLabel(transport: string) {
  return `${TRANSPORT_EMOJI[transport] ?? '📱'} ${TRANSPORT_LABELS[transport] ?? transport}`
}

/**
 * Подпись сообщения с указанием конкретного канала (если в WazzUp их несколько на транспорт)
 * и сырого идентификатора клиента, использованного для этого сообщения. Без данных — деградирует
 * до обычного transportLabel().
 */
export function messageChannelLabel(
  transport: string,
  channelId: string | null | undefined,
  chatId: string | null | undefined,
  channels: { channelId: string; plainId: string }[]
): string {
  const ourId = channelId ? channels.find(c => c.channelId === channelId)?.plainId : null
  let result = ourId ? `${transportLabel(transport)} — ${ourId}` : transportLabel(transport)
  if (chatId) result += ` → клиент ${chatId}`
  return result
}

/** Варианты каналов: каналы переписки контакта + WhatsApp/SMS по КАЖДОМУ телефону */
export function channelOptions(contact?: ChannelContact | null): ChannelOption[] {
  const opts: ChannelOption[] = []
  const seen = new Set<string>()
  const push = (t: ChannelTarget, label: string) => {
    const key = channelKey(t)
    if (seen.has(key)) return
    seen.add(key)
    opts.push({ ...t, key, label })
  }

  for (const ch of contact?.channels ?? []) {
    push({ transport: ch.transport, chatId: ch.chatId }, transportLabel(ch.transport))
  }

  const phones = [
    ...(contact?.phone ? [contact.phone] : []),
    ...(contact?.phones?.map(p => p.phone) ?? []),
  ]
  for (const phone of phones) {
    const chatId = phoneToChatId(phone)
    if (!chatId) continue
    push({ transport: 'whatsapp', chatId }, `${TRANSPORT_EMOJI.whatsapp} WhatsApp (${phone})`)
    push({ transport: 'sms', chatId }, `${TRANSPORT_EMOJI.sms} SMS (${phone})`)
  }
  return opts
}

/** Все email-адреса контакта (основной + доп.) для отправки писем */
export function emailOptions(contact?: ChannelContact | null): ChannelOption[] {
  const opts: ChannelOption[] = []
  const seen = new Set<string>()
  const addresses = [
    ...(contact?.email ? [contact.email] : []),
    ...(contact?.emails?.map(e => e.email) ?? []),
  ]
  for (const address of addresses) {
    const key = address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    opts.push({ transport: 'email', chatId: address, key: `email|${address}`, label: `${TRANSPORT_EMOJI.email} ${address}` })
  }
  return opts
}
