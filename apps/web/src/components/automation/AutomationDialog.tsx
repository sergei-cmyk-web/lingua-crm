'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import { automationsApi, pipelinesApi, fieldsApi, usersApi, integrationsApi } from '@/lib/api'
import { TRANSPORT_LABELS } from '@crm/shared'
import type {
  Automation,
  TriggerConfig,
  ActionConfig,
  TriggerType,
  ActionType,
  Pipeline,
  FieldDefinition,
} from '@crm/shared'

interface Props {
  pipelineId: string
  automation?: Automation
  onClose: () => void
  onSaved: () => void
}

const triggerLabels: Record<TriggerType, string> = {
  stage_enter: 'Сделка вошла в этап',
  stage_leave: 'Сделка покинула этап',
  field_change: 'Изменение поля',
  webhook: 'Входящее сообщение WazzUp',
  timer: 'В этапе дольше N часов',
  trial_booked: 'Записан пробный урок',
  trial_completed: 'Пробный урок состоялся',
  trial_no_show: 'Не пришёл на пробный',
  subscription_low_balance: 'Осталось мало уроков',
  payment_received: 'Оплата получена',
}

const actionLabels: Record<ActionType, string> = {
  create_task: 'Создать задачу',
  send_wazzup_message: 'Отправить сообщение',
  change_field: 'Изменить поле',
  move_stage: 'Переместить в этап',
  notify_user: 'Уведомить пользователя',
  send_http_request: 'Отправить HTTP-запрос',
}

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// send_wazzup_message идёт через sendViaTransport (sms → TargetSMS, иначе → WazzUp) —
// email этим диспетчером не поддерживается (отдельный флоу sendEmailMessage), поэтому
// в списке каналов для действия автоматизации его не показываем.
const messageTransports = Object.entries(TRANSPORT_LABELS).filter(([t]) => t !== 'email')

const inputClass =
  'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

function renderValueInput(
  field: FieldDefinition | undefined,
  value: unknown,
  onChange: (v: unknown) => void
) {
  if (!field) {
    return (
      <input
        className={inputClass}
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Значение"
      />
    )
  }

  switch (field.fieldType) {
    case 'select':
      return (
        <select className={inputClass} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          <option value="">— выберите —</option>
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={e => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Значение включено</span>
        </label>
      )
    case 'number':
      return (
        <input
          type="number"
          className={inputClass}
          value={value != null && value !== '' ? String(value) : ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className={inputClass}
          value={value ? String(value).slice(0, 10) : ''}
          onChange={e => onChange(e.target.value)}
        />
      )
    default:
      return (
        <input
          className={inputClass}
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value)}
        />
      )
  }
}

export default function AutomationDialog({ pipelineId, automation, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(automation?.name ?? '')
  const [active, setActive] = useState(automation?.active ?? true)
  const [trigger, setTrigger] = useState<TriggerConfig>(automation?.trigger ?? { type: 'stage_enter' })
  const [actions, setActions] = useState<ActionConfig[]>(automation?.actions ?? [])
  const [error, setError] = useState<string | null>(null)

  const { data: pipelines = [] } = useQuery<Pipeline[]>({ queryKey: ['pipelines'], queryFn: pipelinesApi.list })
  const stagesInPipeline = pipelines.find(p => p.id === pipelineId)?.stages ?? []

  // Без pipelineId — так же, как DealDetail.tsx: GET /fields с pipelineId фильтрует
  // строго по этой воронке и теряет глобальные (pipelineId: null) поля.
  const { data: dealFields = [] } = useQuery<FieldDefinition[]>({
    queryKey: ['fields', 'deal'],
    queryFn: () => fieldsApi.list({ entityType: 'deal' }),
  })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })
  const { data: wazzupData } = useQuery({
    queryKey: ['integrations', 'wazzup'],
    queryFn: () => integrationsApi.wazzupChannels(),
    enabled: trigger.type === 'webhook',
  })
  const activeChannels = (wazzupData?.channels ?? []).filter(c => c.state === 'active')

  const updateTrigger = (patch: Partial<TriggerConfig>) => setTrigger(prev => ({ ...prev, ...patch }))
  const setTriggerType = (type: TriggerType) => setTrigger({ type })

  const addAction = (type: ActionType) => setActions(prev => [...prev, { type }])
  const setActionType = (i: number, type: ActionType) =>
    setActions(prev => prev.map((a, idx) => (idx === i ? { type } : a)))
  const updateAction = (i: number, patch: Partial<ActionConfig>) =>
    setActions(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const removeAction = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i))
  const moveAction = (i: number, dir: -1 | 1) =>
    setActions(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), pipelineId, trigger, actions, active }
      return automation ? automationsApi.update(automation.id, payload) : automationsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      onSaved()
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string; error?: string } } }
      setError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Ошибка сохранения автоматизации')
    },
  })

  const isTriggerValid = trigger.type !== 'timer' || (trigger.delayHours != null && trigger.delayHours > 0)
  const isActionValid = (a: ActionConfig): boolean => {
    switch (a.type) {
      case 'send_wazzup_message': return !!a.message?.trim()
      case 'change_field': return !!a.fieldKey && a.fieldValue !== undefined && a.fieldValue !== ''
      case 'move_stage': return !!a.stageId
      case 'notify_user': return !!a.userId
      case 'send_http_request': return !!a.httpUrl?.trim()
      default: return true
    }
  }
  const isValid = name.trim().length > 0 && isTriggerValid && actions.length > 0 && actions.every(isActionValid)

  const renderTriggerFields = () => {
    switch (trigger.type) {
      case 'stage_enter':
      case 'stage_leave':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Этап</label>
            <select
              className={inputClass}
              value={trigger.stageId ?? ''}
              onChange={e => updateTrigger({ stageId: e.target.value || undefined })}
            >
              <option value="">— любой этап —</option>
              {stagesInPipeline.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )
      case 'field_change': {
        const selectedField = dealFields.find(f => f.key === trigger.fieldKey)
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Поле</label>
              <select
                className={inputClass}
                value={trigger.fieldKey ?? ''}
                onChange={e => updateTrigger({ fieldKey: e.target.value || undefined, fieldValue: undefined })}
              >
                <option value="">— любое поле —</option>
                {dealFields.map(f => (
                  <option key={f.id} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            {trigger.fieldKey && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Значение (опционально)</label>
                {renderValueInput(selectedField, trigger.fieldValue, v => updateTrigger({ fieldValue: v }))}
              </div>
            )}
          </div>
        )
      }
      case 'timer':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Через сколько часов *</label>
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={trigger.delayHours ?? ''}
                  onChange={e => updateTrigger({ delayHours: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Этап</label>
                <select
                  className={inputClass}
                  value={trigger.stageId ?? ''}
                  onChange={e => updateTrigger({ stageId: e.target.value || undefined })}
                >
                  <option value="">— любой этап —</option>
                  {stagesInPipeline.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Например, 24 — сработает, если сделка провела в этапе больше 24 часов
            </p>
          </div>
        )
      case 'webhook':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Канал</label>
            <select
              className={inputClass}
              value={trigger.channelId ?? ''}
              onChange={e => updateTrigger({ channelId: e.target.value || undefined })}
            >
              <option value="">— любой канал —</option>
              {activeChannels.map(c => (
                <option key={c.channelId} value={c.channelId}>
                  {(TRANSPORT_LABELS[c.transport] ?? c.transport) + ' — ' + c.plainId}
                </option>
              ))}
            </select>
            {activeChannels.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Нет подключённых активных каналов WazzUp</p>
            )}
          </div>
        )
      case 'subscription_low_balance':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Порог остатка уроков</label>
            <input
              type="number"
              min="0"
              placeholder="2"
              className={inputClass}
              value={trigger.threshold ?? ''}
              onChange={e => updateTrigger({ threshold: e.target.value ? Number(e.target.value) : undefined })}
            />
            <p className="text-xs text-gray-400 mt-1">
              Срабатывает один раз, когда остаток ТОЧНО равен этому числу
            </p>
          </div>
        )
      default:
        return <p className="text-xs text-gray-400">Дополнительных настроек нет</p>
    }
  }

  const renderActionFields = (action: ActionConfig, i: number) => {
    switch (action.type) {
      case 'create_task':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Название задачи</label>
              <input
                className={inputClass}
                placeholder="Задача"
                value={action.taskTitle ?? ''}
                onChange={e => updateAction(i, { taskTitle: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Срок, часов от старта</label>
                <input
                  type="number"
                  className={inputClass}
                  value={action.taskDueDateHours ?? ''}
                  onChange={e => updateAction(i, { taskDueDateHours: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ответственный</label>
                <select
                  className={inputClass}
                  value={action.taskAssigneeId ?? ''}
                  onChange={e => updateAction(i, { taskAssigneeId: e.target.value || undefined })}
                >
                  <option value="">— как у сделки —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )
      case 'send_wazzup_message':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Текст сообщения *</label>
              <textarea
                rows={3}
                className={inputClass + ' resize-none'}
                value={action.message ?? ''}
                onChange={e => updateAction(i, { message: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Канал</label>
              <select
                className={inputClass}
                value={action.transport ?? ''}
                onChange={e => updateAction(i, { transport: e.target.value || undefined })}
              >
                <option value="">— канал контакта —</option>
                {messageTransports.map(([t, label]) => (
                  <option key={t} value={t}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        )
      case 'change_field': {
        const selectedField = dealFields.find(f => f.key === action.fieldKey)
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Поле *</label>
              <select
                className={inputClass}
                value={action.fieldKey ?? ''}
                onChange={e => updateAction(i, { fieldKey: e.target.value || undefined, fieldValue: undefined })}
              >
                <option value="">— выберите поле —</option>
                {dealFields.map(f => (
                  <option key={f.id} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Новое значение *</label>
              {renderValueInput(selectedField, action.fieldValue, v => updateAction(i, { fieldValue: v }))}
            </div>
          </div>
        )
      }
      case 'move_stage':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Этап *</label>
            <select
              className={inputClass}
              value={action.stageId ?? ''}
              onChange={e => updateAction(i, { stageId: e.target.value || undefined })}
            >
              <option value="">— выберите этап —</option>
              {pipelines.map(p => (
                <optgroup key={p.id} label={p.name}>
                  {p.stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )
      case 'send_http_request': {
        const headers = action.httpHeaders ?? []
        const setHeaders = (next: { key: string; value: string }[]) => updateAction(i, { httpHeaders: next })
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Метод</label>
                <select
                  className={inputClass}
                  value={action.httpMethod ?? 'POST'}
                  onChange={e => updateAction(i, { httpMethod: e.target.value as ActionConfig['httpMethod'] })}
                >
                  {httpMethods.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">URL *</label>
                <input
                  className={inputClass}
                  placeholder="https://example.com/hook/{dealId}"
                  value={action.httpUrl ?? ''}
                  onChange={e => updateAction(i, { httpUrl: e.target.value })}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">Заголовки</label>
                <button
                  type="button"
                  onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  + добавить
                </button>
              </div>
              <div className="space-y-1">
                {headers.map((h, hi) => (
                  <div key={hi} className="flex items-center gap-1">
                    <input
                      className={inputClass}
                      placeholder="Authorization"
                      value={h.key}
                      onChange={e => setHeaders(headers.map((x, xi) => (xi === hi ? { ...x, key: e.target.value } : x)))}
                    />
                    <input
                      className={inputClass}
                      placeholder="Bearer ..."
                      value={h.value}
                      onChange={e => setHeaders(headers.map((x, xi) => (xi === hi ? { ...x, value: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      onClick={() => setHeaders(headers.filter((_, xi) => xi !== hi))}
                      className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Тело запроса (JSON)</label>
              <textarea
                rows={3}
                className={inputClass + ' resize-none font-mono'}
                placeholder={'{"deal": "{dealId}", "name": "{имя}"}'}
                value={action.httpBody ?? ''}
                onChange={e => updateAction(i, { httpBody: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Плейсхолдеры в URL/заголовках/теле: {'{dealId} {название} {сумма} {имя} {телефон} {email}'}
              </p>
            </div>
          </div>
        )
      }
      case 'notify_user':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Пользователь *</label>
              <select
                className={inputClass}
                value={action.userId ?? ''}
                onChange={e => updateAction(i, { userId: e.target.value || undefined })}
              >
                <option value="">— выберите —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Текст уведомления</label>
              <textarea
                rows={2}
                className={inputClass + ' resize-none'}
                placeholder="Событие автоматизации"
                value={action.message ?? ''}
                onChange={e => updateAction(i, { message: e.target.value })}
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {automation ? 'Редактировать автоматизацию' : 'Новая автоматизация'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Название</label>
            <input
              className={inputClass}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Напомнить о звонке"
            />
          </div>

          <div className="border border-gray-100 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-500">Триггер</label>
            <select
              className={inputClass}
              value={trigger.type}
              onChange={e => setTriggerType(e.target.value as TriggerType)}
            >
              {Object.entries(triggerLabels).map(([type, label]) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
            {renderTriggerFields()}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-500">Действия</label>
              <select
                className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value=""
                onChange={e => {
                  if (e.target.value) addAction(e.target.value as ActionType)
                }}
              >
                <option value="">+ добавить действие</option>
                {Object.entries(actionLabels).map(([type, label]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>

            {actions.map((action, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    className={inputClass}
                    value={action.type}
                    onChange={e => setActionType(i, e.target.value as ActionType)}
                  >
                    {Object.entries(actionLabels).map(([type, label]) => (
                      <option key={type} value={type}>{label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveAction(i, -1)}
                      disabled={i === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAction(i, 1)}
                      disabled={i === actions.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAction(i)}
                      className="p-1 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {renderActionFields(action, i)}
              </div>
            ))}

            {actions.length === 0 && (
              <p className="text-xs text-gray-400">Добавьте хотя бы одно действие</p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Активна</span>
          </label>

          {error && <p className="text-xs text-red-500 bg-red-50 px-2.5 py-1.5 rounded-md">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Отмена
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!isValid || saveMutation.isPending}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Сохранение…' : automation ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
