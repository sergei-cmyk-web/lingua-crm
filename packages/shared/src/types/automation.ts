export type TriggerType =
  | 'stage_enter'
  | 'stage_leave'
  | 'field_change'
  | 'webhook'
  | 'timer'
  | 'trial_booked'
  | 'trial_completed'
  | 'trial_no_show'
  | 'subscription_low_balance'
  | 'payment_received'
export type ActionType =
  | 'create_task'
  | 'send_wazzup_message'
  | 'change_field'
  | 'move_stage'
  | 'notify_user'
  | 'send_http_request'

export interface TriggerConfig {
  type: TriggerType
  stageId?: string
  fieldKey?: string
  fieldValue?: unknown
  delayHours?: number
  /** Порог остатка уроков для subscription_low_balance (по умолчанию 2) */
  threshold?: number
  /** Конкретный подключённый WazzUp-канал для webhook (WazzupChannel.channelId); пусто — любой канал */
  channelId?: string
}

export interface ActionConfig {
  type: ActionType
  taskTitle?: string
  taskDueDateHours?: number
  taskAssigneeId?: string
  message?: string
  /** Канал для send_wazzup_message: whatsapp|telegram|...|sms; по умолчанию — канал контакта */
  transport?: string
  fieldKey?: string
  fieldValue?: unknown
  stageId?: string
  userId?: string
  /** send_http_request: URL, метод, заголовки, тело — поддерживают плейсхолдеры {dealId}/{имя}/{сумма}/... */
  httpUrl?: string
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  httpHeaders?: { key: string; value: string }[]
  httpBody?: string
}

export interface Automation {
  id: string
  name: string
  pipelineId: string
  trigger: TriggerConfig
  actions: ActionConfig[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAutomationDto {
  name: string
  pipelineId: string
  trigger: TriggerConfig
  actions: ActionConfig[]
  active?: boolean
}
