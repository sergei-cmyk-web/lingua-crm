import type { FieldDefinition } from '@prisma/client'

interface ExportDeal {
  id: string
  title: string
  budget: unknown
  custom_fields: unknown
  lostComment: string | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
  stage: { name: string; type: string } | null
  pipeline: { name: string } | null
  assignee: { name: string; email: string } | null
  lostReason: { name: string } | null
  company: { name: string } | null
  contact: {
    id: string
    name: string
    phone: string | null
    email: string | null
    telegramUsername: string | null
    custom_fields: unknown
    phones: { phone: string }[]
    emails: { email: string }[]
  } | null
}

interface FieldOption {
  value: string
  label: string
}

function formatDate(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function formatFieldValue(field: FieldDefinition, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const options = (field.options as unknown as FieldOption[] | null) ?? []
  switch (field.fieldType) {
    case 'select': {
      const opt = options.find(o => o.value === raw)
      return opt?.label ?? String(raw)
    }
    case 'multiselect': {
      const values = Array.isArray(raw) ? raw : [raw]
      return values.map(v => options.find(o => o.value === v)?.label ?? String(v)).join('; ')
    }
    case 'checkbox':
      return raw ? 'Да' : 'Нет'
    case 'date':
      return String(raw).slice(0, 10)
    default:
      return String(raw)
  }
}

// Колонки зависят только от схемы полей — считаются один раз до стриминга строк.
export function buildExportColumns(dealFields: FieldDefinition[], contactFields: FieldDefinition[]): string[] {
  const staticDealColumns = [
    'ID', 'Название', 'Воронка', 'Этап', 'Тип этапа', 'Бюджет',
    'Ответственный', 'Email ответственного', 'Причина потери', 'Комментарий к потере',
    'Дата закрытия', 'Дата создания', 'Дата обновления',
  ]
  const staticContactColumns = [
    'ID контакта', 'Имя контакта', 'Телефон', 'Доп. телефоны',
    'Email контакта', 'Доп. email', 'Telegram', 'Компания',
  ]
  return [
    ...staticDealColumns,
    ...staticContactColumns,
    ...dealFields.map(f => f.label),
    ...contactFields.map(f => `Контакт: ${f.label}`),
  ]
}

// Одна строка экспорта — вызывается по каждой сделке из батч-курсора, весь набор в память не грузится.
export function buildDealExportRow(
  deal: ExportDeal,
  dealFields: FieldDefinition[],
  contactFields: FieldDefinition[]
): Record<string, string> {
  const customFields = (deal.custom_fields as Record<string, unknown>) ?? {}
  const contact = deal.contact
  const contactCustomFields = (contact?.custom_fields as Record<string, unknown>) ?? {}

  const row: Record<string, string> = {
    'ID': deal.id,
    'Название': deal.title,
    'Воронка': deal.pipeline?.name ?? '',
    'Этап': deal.stage?.name ?? '',
    'Тип этапа': deal.stage?.type ?? '',
    'Бюджет': deal.budget != null ? String(deal.budget) : '',
    'Ответственный': deal.assignee?.name ?? '',
    'Email ответственного': deal.assignee?.email ?? '',
    'Причина потери': deal.lostReason?.name ?? '',
    'Комментарий к потере': deal.lostComment ?? '',
    'Дата закрытия': formatDate(deal.closedAt),
    'Дата создания': formatDate(deal.createdAt),
    'Дата обновления': formatDate(deal.updatedAt),
    'ID контакта': contact?.id ?? '',
    'Имя контакта': contact?.name ?? '',
    'Телефон': contact?.phone ?? '',
    'Доп. телефоны': contact ? contact.phones.map(p => p.phone).join('; ') : '',
    'Email контакта': contact?.email ?? '',
    'Доп. email': contact ? contact.emails.map(e => e.email).join('; ') : '',
    'Telegram': contact?.telegramUsername ?? '',
    'Компания': deal.company?.name ?? '',
  }

  for (const field of dealFields) {
    row[field.label] = formatFieldValue(field, customFields[field.key])
  }
  for (const field of contactFields) {
    row[`Контакт: ${field.label}`] = formatFieldValue(field, contactCustomFields[field.key])
  }

  return row
}
