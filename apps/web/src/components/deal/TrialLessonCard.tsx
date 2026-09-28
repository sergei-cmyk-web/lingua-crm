'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, CalendarClock, Check, X, UserX, Pencil } from 'lucide-react'
import type { TrialStatus } from '@crm/shared'
import { trialsApi, type TrialReminderTarget } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { channelOptions, emailOptions, channelKey as targetKey, transportLabel, type ChannelOption } from '@/lib/channelOptions'

export type TrialItem = {
  id: string
  scheduledAt: string
  status: TrialStatus | string
  reminderTransport: string
  reminderChatId?: string | null
  reminderTargets?: TrialReminderTarget[] | null
}

type ContactInfo = {
  phone?: string | null
  phones?: { id: string; phone: string; label?: string | null }[]
  channels: { transport: string; chatId: string }[]
  email?: string | null
  emails?: { id: string; email: string; label?: string | null }[]
}

interface Props {
  dealId: string
  trials: TrialItem[]
  contact?: ContactInfo | null
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Запланирован',
  completed: 'Состоялся',
  no_show: 'Не пришёл',
  canceled: 'Отменён',
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'text-blue-600 bg-blue-50',
  completed: 'text-green-600 bg-green-50',
  no_show: 'text-red-600 bg-red-50',
  canceled: 'text-gray-500 bg-gray-100',
}

/** Каналы урока: reminderTargets, для старых записей — legacy-поля. */
function trialTargets(trial: TrialItem): TrialReminderTarget[] {
  const targets = (trial.reminderTargets ?? []).filter(t => t?.transport && t?.chatId)
  if (targets.length > 0) return targets
  if (trial.reminderTransport) {
    return [{ transport: trial.reminderTransport, chatId: trial.reminderChatId ?? '' }]
  }
  return []
}

function ChannelPicker({ options, selected, onToggle }: {
  options: ChannelOption[]
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
        У контакта нет телефона и каналов — добавьте телефон в карточке контакта
      </p>
    )
  }
  return (
    <div className="space-y-1">
      {options.map(o => (
        <label
          key={o.key}
          className="flex items-center gap-2 text-sm text-gray-700 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={selected.has(o.key)}
            onChange={() => onToggle(o.key)}
          />
          <span className="text-xs">{o.label}</span>
        </label>
      ))}
    </div>
  )
}

export function TrialLessonCard({ dealId, trials, contact }: Props) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [editingChannels, setEditingChannels] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const active = trials.find(t => t.status === 'scheduled')
  const history = trials.filter(t => t.status !== 'scheduled')
  const activeTargets = active ? trialTargets(active) : []

  const options = [...channelOptions(contact), ...emailOptions(contact)]
  // Текущие каналы урока могут ссылаться на удалённый телефон/канал — показываем их всё равно
  const editOptions: ChannelOption[] = [
    ...options,
    ...activeTargets
      .filter(t => !options.some(o => o.key === targetKey(t)))
      .map(t => ({ ...t, key: targetKey(t), label: `${transportLabel(t.transport)} (${t.chatId})` })),
  ]

  const toggleKey = (key: string) =>
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const selectedTargets = (opts: ChannelOption[]) =>
    opts.filter(o => selectedKeys.has(o.key)).map(({ transport, chatId }) => ({ transport, chatId }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
    queryClient.invalidateQueries({ queryKey: ['deals'] })
  }

  const onError = (err: unknown) => {
    const axErr = err as { response?: { data?: { error?: string } } }
    setError(axErr.response?.data?.error ?? (err instanceof Error ? err.message : 'Ошибка'))
  }

  const createMutation = useMutation({
    mutationFn: () =>
      trialsApi.create(dealId, {
        scheduledAt: new Date(dateValue).toISOString(),
        reminderTargets: selectedTargets(options),
      }),
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setDateValue('')
      setError(null)
    },
    onError,
  })

  const rescheduleMutation = useMutation({
    mutationFn: () => trialsApi.reschedule(active!.id, new Date(dateValue).toISOString()),
    onSuccess: () => {
      invalidate()
      setRescheduling(false)
      setDateValue('')
      setError(null)
    },
    onError,
  })

  const statusMutation = useMutation({
    mutationFn: (status: 'completed' | 'no_show' | 'canceled') => trialsApi.setStatus(active!.id, status),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError,
  })

  const channelsMutation = useMutation({
    mutationFn: () => trialsApi.setReminderTargets(active!.id, selectedTargets(editOptions)),
    onSuccess: () => {
      invalidate()
      setEditingChannels(false)
      setError(null)
    },
    onError,
  })

  const openCreateForm = () => {
    setShowForm(true)
    setSelectedKeys(new Set(options.length > 0 ? [options[0].key] : []))
    setError(null)
  }

  const openChannelsEditor = () => {
    setEditingChannels(true)
    setRescheduling(false)
    setSelectedKeys(new Set(activeTargets.map(targetKey)))
    setError(null)
  }

  const minDate = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" />
          Пробный урок
        </h3>
        {!active && !showForm && (
          <button onClick={openCreateForm} className="text-xs text-blue-600 hover:text-blue-700">
            + Записать на пробный
          </button>
        )}
      </div>

      {/* Активный урок */}
      {active && !rescheduling && !editingChannels && (
        <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{formatDateTime(active.scheduledAt)}</p>
              <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                <p>Напоминания:</p>
                {activeTargets.map(t => (
                  <p key={targetKey(t)} className="pl-2">
                    {transportLabel(t.transport)}
                    {t.chatId ? ` → ${t.chatId}` : ''}
                  </p>
                ))}
              </div>
            </div>
            <span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_COLOR.scheduled)}>
              {STATUS_LABEL.scheduled}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => statusMutation.mutate('completed')}
              disabled={statusMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Состоялся
            </button>
            <button
              onClick={() => statusMutation.mutate('no_show')}
              disabled={statusMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <UserX className="h-3 w-3" /> Не пришёл
            </button>
            <button
              onClick={() => {
                setRescheduling(true)
                setDateValue(new Date(active.scheduledAt).toISOString().slice(0, 16))
                setError(null)
              }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-gray-300"
            >
              <CalendarClock className="h-3 w-3" /> Перенести
            </button>
            <button
              onClick={openChannelsEditor}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-gray-300"
            >
              <Pencil className="h-3 w-3" /> Каналы
            </button>
            <button
              onClick={() => {
                if (confirm('Отменить пробный урок? Напоминания будут сняты.')) statusMutation.mutate('canceled')
              }}
              disabled={statusMutation.isPending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Отменить
            </button>
          </div>
        </div>
      )}

      {/* Форма переноса */}
      {active && rescheduling && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
          <label className="block text-xs text-gray-500">Новые дата и время</label>
          <input
            type="datetime-local"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={dateValue}
            min={minDate}
            onChange={e => setDateValue(e.target.value)}
          />
          <p className="text-xs text-gray-400">Старые напоминания снимутся, новые запланируются автоматически</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setRescheduling(false); setError(null) }}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
            >
              Отмена
            </button>
            <button
              onClick={() => rescheduleMutation.mutate()}
              disabled={!dateValue || rescheduleMutation.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {rescheduleMutation.isPending ? 'Сохранение...' : 'Перенести'}
            </button>
          </div>
        </div>
      )}

      {/* Редактирование каналов напоминаний */}
      {active && editingChannels && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
          <label className="block text-xs text-gray-500">Каналы напоминаний</label>
          <ChannelPicker options={editOptions} selected={selectedKeys} onToggle={toggleKey} />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditingChannels(false); setError(null) }}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
            >
              Отмена
            </button>
            <button
              onClick={() => channelsMutation.mutate()}
              disabled={selectedKeys.size === 0 || channelsMutation.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {channelsMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Форма записи */}
      {!active && showForm && (
        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Дата и время урока</label>
            <input
              type="datetime-local"
              autoFocus
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={dateValue}
              min={minDate}
              onChange={e => setDateValue(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Каналы напоминаний (можно несколько)</label>
            <ChannelPicker options={options} selected={selectedKeys} onToggle={toggleKey} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
            >
              Отмена
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!dateValue || selectedKeys.size === 0 || createMutation.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Запись...' : 'Записать'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}

      {!active && !showForm && history.length === 0 && (
        <p className="text-xs text-gray-400">Пробный урок не назначен</p>
      )}

      {/* История прошлых уроков */}
      {history.length > 0 && (
        <div className="mt-2 space-y-1">
          {history.map(t => (
            <div key={t.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-50">
              <span className="text-gray-500">{formatDateTime(t.scheduledAt)}</span>
              <span className={cn('px-1.5 py-0.5 rounded-full', STATUS_COLOR[t.status] ?? 'text-gray-500 bg-gray-100')}>
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
