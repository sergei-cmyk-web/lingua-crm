// Единая нормализация телефонов.
// В БД контакты хранятся как '+7XXXXXXXXXX', TargetSMS и WazzUp (whatsapp) хотят цифры '79...'.

/** Только цифры, с приведением российских номеров: 8XXX… → 7XXX…, 9XXXXXXXXX → 79XXXXXXXXX */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length === 10 && d.startsWith('9')) d = '7' + d
  return d
}

/** Канонический формат хранения: '+<digits>'; пустая строка если цифр нет */
export function phoneCanonical(raw: string): string {
  const d = phoneDigits(raw)
  return d ? `+${d}` : ''
}
