export type TrialStatus = 'scheduled' | 'completed' | 'no_show' | 'canceled'

export interface TrialLesson {
  id: string
  dealId: string
  scheduledAt: string
  status: TrialStatus
  reminderTransport: string
  reminderChatId?: string | null
  createdById?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTrialDto {
  scheduledAt: string
  reminderTransport: string
  reminderChatId?: string
}

export interface TrialReminderOffset {
  /** За сколько минут до урока отправлять */
  minutes: number
  /** Шаблон с плейсхолдерами {имя} {дата} {время} */
  template: string
  /** Транспорты, по которым слать именно этот офсет; пусто/отсутствует = все каналы урока */
  channels?: string[]
}

export interface TrialRemindersSettings {
  offsets: TrialReminderOffset[]
}
