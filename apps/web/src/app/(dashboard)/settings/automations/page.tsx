'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Zap, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { automationsApi, pipelinesApi } from '@/lib/api'
import type { Automation, Pipeline } from '@crm/shared'
import { cn } from '@/lib/utils'
import AutomationDialog from '@/components/automation/AutomationDialog'

const triggerLabels: Record<string, string> = {
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

const actionLabels: Record<string, string> = {
  create_task: 'Создать задачу',
  send_wazzup_message: 'Отправить сообщение',
  change_field: 'Изменить поле',
  move_stage: 'Переместить в этап',
  notify_user: 'Уведомить пользователя',
  send_http_request: 'Отправить HTTP-запрос',
}

export default function AutomationsPage() {
  const queryClient = useQueryClient()

  const { data: pipelines = [] } = useQuery<Pipeline[]>({ queryKey: ['pipelines'], queryFn: pipelinesApi.list })
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const pipelineId = selectedPipelineId || pipelines[0]?.id

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)

  const { data: automations = [] } = useQuery<Automation[]>({
    queryKey: ['automations', pipelineId],
    queryFn: () => automationsApi.list(pipelineId),
    enabled: !!pipelineId,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      automationsApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: automationsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Автоматизации</h1>
          <p className="text-xs text-gray-500 mt-0.5">Настройка триггеров для воронки продаж</p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 1 && (
            <select
              className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={pipelineId ?? ''}
              onChange={e => setSelectedPipelineId(e.target.value)}
            >
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-2 max-w-3xl">
          {automations.map((automation: Automation) => {
            const trigger = automation.trigger as { type: string }
            const actions = automation.actions as Array<{ type: string }>
            return (
              <div
                key={automation.id}
                onClick={() => { setEditing(automation); setDialogOpen(true) }}
                className={cn(
                  'bg-white rounded-xl border p-4 transition-opacity cursor-pointer hover:border-gray-300',
                  automation.active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
                      <p className="text-sm font-semibold text-gray-900">{automation.name}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                        {triggerLabels[trigger.type] ?? trigger.type}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {actions.map((action, i) => (
                          <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md">
                            {actionLabels[action.type] ?? action.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggleMutation.mutate({ id: automation.id, active: !automation.active }) }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {automation.active
                        ? <ToggleRight className="h-5 w-5 text-blue-600" />
                        : <ToggleLeft className="h-5 w-5" />
                      }
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteMutation.mutate(automation.id) }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {automations.length === 0 && (
            <div className="text-center py-16">
              <Zap className="h-8 w-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">Нет автоматизаций</p>
              <p className="text-xs text-gray-400 mt-1">
                Создайте триггер, например: "Сделка перешла в этап → создать задачу"
              </p>
            </div>
          )}
        </div>
      </div>

      {dialogOpen && pipelineId && (
        <AutomationDialog
          pipelineId={pipelineId}
          automation={editing ?? undefined}
          onClose={() => setDialogOpen(false)}
          onSaved={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
