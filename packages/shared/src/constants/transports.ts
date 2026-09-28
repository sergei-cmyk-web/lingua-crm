// Единый словарь транспортов сообщений (WazzUp + SMS).
// 'sms' — не WazzUp-канал: отправка идёт через TargetSMS по номеру телефона.
// ВАЖНО: у WazzUp 'tgapi' — ЛИЧНЫЙ Telegram (Telegram API по номеру телефона),
// а 'telegram' — Telegram-БОТ (BotFather). Подтверждено реальным ответом
// GET /v3/channels (июль 2026); раньше в коде было наоборот.
export const TRANSPORT_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram Bot',
  tgapi:    'Telegram',
  instagram:'Instagram',
  max:      'VK MAX',
  maxbot:   'MAX Bot',
  vk:       'ВКонтакте',
  avito:    'Авито',
  viber:    'Viber',
  wapi:     'WhatsApp Business API',
  sms:      'SMS',
  email:    'Email',
}

export const TRANSPORT_EMOJI: Record<string, string> = {
  whatsapp: '💬',
  telegram: '🤖',
  tgapi:    '✈️',
  instagram:'📸',
  max:      '🟦',
  maxbot:   '🤖',
  vk:       '🅱️',
  avito:    '🟠',
  viber:    '💜',
  wapi:     '💬',
  sms:      '📱',
  email:    '✉️',
}

// WhatsApp, личный Telegram (tgapi), личный MAX поддерживают первый контакт.
// Боты писать первыми не могут — ограничение самого Telegram.
export const FIRST_CONTACT_TRANSPORTS = ['whatsapp', 'tgapi', 'max']

export function channelCanInitiate(transport: string, plainId: string): boolean {
  if (FIRST_CONTACT_TRANSPORTS.includes(transport)) return true
  // Защитная ветка: если личный аккаунт вдруг пришёл как 'telegram' (легаси),
  // отличаем его от бота по username — у ботов он всегда оканчивается на 'bot'.
  if (transport === 'telegram' && plainId && !plainId.toLowerCase().endsWith('bot')) return true
  return false
}
