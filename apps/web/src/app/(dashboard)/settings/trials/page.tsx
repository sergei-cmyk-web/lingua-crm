'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Plus, Trash2 } from 'lucide-react'
import { TRANSPORT_LABELS, TRANSPORT_EMOJI } from '@crm/shared'
import { integrationsApi } from '@/lib/api'

type Offset = { minutes: number; template: string; channels?: string[] }

const SMS_LIMIT = 70

const DEFAULT_OFFSETS: Offset[] = [
  { minutes: 1440, template: 'Здравствуйте, {имя}! Напоминаем: {дата} в {время} у вас пробный урок. Ждём вас!' },
  { minutes: 60, template: '{имя}, напоминаем: сегодня в {время} у вас пробный урок. До встречи!' },
]

function offsetLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440
    return `за ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return `за ${h} ${h === 1 ? 'час' : h < 5 ? 'часа' : 'часов'}`
  }
  return `за ${minutes} мин`
}

// Живой пример подстановки для превью шаблона
function preview(template: string): string {
  return template
    .replaceAll('{имя}', 'Анна')
    .replaceAll('{дата}', '15 июля')
    .replaceAll('{время}', '18:00')
}

export default function TrialSettingsPage() {
  const queryClient = useQueryClient()
  const [offsets, setOffsets] = useState<Offset[]>(DEFAULT_OFFSETS)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data: setting, isLoading } = useQuery({
    queryKey: ['settings', 'trial_reminders'],
    queryFn: () => integrationsApi.getSetting('trial_reminders'),
  })

  useEffect(() => {
    if (loaded || isLoading) return
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value)
        if (Array.isArray(parsed?.offsets) && parsed.offsets.length > 0) setOffsets(parsed.offsets)
      } catch {
        // повреждённая настройка — показываем дефолт
      }
    }
    setLoaded(true)
  }, [setting, isLoading, loaded])

  const saveMutation = useMutation({
    mutationFn: () => {
      const valid = offsets.filter(o => o.minutes > 0 && o.template.trim())
      return integrationsApi.putSetting('trial_reminders', JSON.stringify({ offsets: valid }))
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['settings', 'trial_reminders'] })
    },
  })

  const update = (i: number, patch: Partial<Offset>) =>
    setOffsets(prev => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const toggleChannel = (i: number, transport: string) =>
    setOffsets(prev =>
      prev.map((o, idx) => {
        if (idx !== i) return o
        const channels = o.channels ?? []
        const next = channels.includes(transport) ? channels.filter(c => c !== transport) : [...channels, transport]
        return { ...o, channels: next }
      })
    )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Напоминания о пробных уроках</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Отправляются клиенту в выбранный при записи канал. Плейсхолдеры:{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{имя}'}</code>{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{дата}'}</code>{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{время}'}</code>
          </p>
        </div>

        <div className="space-y-3">
          {offsets.map((offset, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Отправить за</span>
                  <input
                    type="number"
                    min="1"
                    className="w-20 px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={offset.minutes}
                    onChange={e => update(i, { minutes: Number(e.target.value) })}
                  />
                  <span className="text-sm text-gray-600">минут до урока</span>
                  <span className="text-xs text-gray-400">({offsetLabel(offset.minutes)})</span>
                </div>
                <button
                  onClick={() => setOffsets(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-1 text-gray-300 hover:text-red-500"
                  title="Удалить напоминание"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                value={offset.template}
                onChange={e => update(i, { template: e.target.value })}
              />
              {(() => {
                const len = offset.template.length
                const channels = offset.channels ?? []
                const smsInPlay = channels.length === 0 || channels.includes('sms')
                const overLimit = len > SMS_LIMIT && smsInPlay
                return (
                  <p className={overLimit ? 'text-xs text-amber-600' : 'text-xs text-gray-400'}>
                    {len}/{SMS_LIMIT} симв.
                    {overLimit && ' — превышает лимит SMS, уйдёт как несколько SMS'}
                  </p>
                )
              })()}
              <div>
                <p className="text-xs text-gray-500 mb-1">Каналы для этого напоминания</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {Object.keys(TRANSPORT_LABELS).map(transport => (
                    <label
                      key={transport}
                      className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={(offset.channels ?? []).includes(transport)}
                        onChange={() => toggleChannel(i, transport)}
                      />
                      <span className="text-xs">
                        {TRANSPORT_EMOJI[transport] ?? '📱'} {TRANSPORT_LABELS[transport]}
                      </span>
                    </label>
                  ))}
                </div>
                {(offset.channels ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Не выбрано — уйдёт по всем каналам урока (как раньше)</p>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Превью: <span className="text-gray-600">{preview(offset.template)}</span>
              </p>
            </div>
          ))}

          <button
            onClick={() =>
              setOffsets(prev => [
                ...prev,
                { minutes: 120, template: '{имя}, напоминаем про пробный урок {дата} в {время}!', channels: [] },
              ])
            }
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" /> Добавить напоминание
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || offsets.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> Сохранено
            </span>
          )}
          {saveMutation.isError && (
            <span className="text-sm text-red-600">Ошибка — нужны права администратора</span>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Изменения действуют для новых записей и переносов. Уже запланированные напоминания
          отправятся по правилам, действовавшим на момент записи (удалённые здесь офсеты не отправятся).
        </p>
      </div>
    </div>
  )
}
