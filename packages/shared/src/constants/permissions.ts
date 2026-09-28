// Плоский справочник прав для матрицы ролей. Лейблы — чекбоксы в /settings/users.
// Системная роль admin получает все права из кода (ALL_PERMISSIONS), а не из БД —
// новый ключ здесь автоматически доступен админу без миграции данных.
export const PERMISSIONS = {
  'settings.crm': 'Настройки CRM (воронка, поля, автоматизации, абонементы, пробные)',
  'settings.integrations': 'Настройки интеграций (WazzUp, SMS, почта, оплата, лид-форма)',
  'users.manage': 'Управление пользователями и ролями',
  'trash.manage': 'Удаление в корзину и работа с корзиной',
  'finance.manage': 'Финансы: абонементы и счета',
  'deals.export': 'Экспорт сделок',
  'entities.edit': 'Редактирование сделок, контактов и компаний',
  'section.analytics': 'Раздел «Аналитика»',
  'section.email': 'Раздел «Почта»',
  'section.chats': 'Раздел «Чаты»',
  'lessons.teach': 'Может вести уроки (виден в селекте преподавателя)',
  'data.viewAll': 'Видит все чаты и почтовые ящики (не только свои)',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

export interface Role {
  id: string
  name: string
  permissions: PermissionKey[]
  isSystem: boolean
  usersCount?: number
}
