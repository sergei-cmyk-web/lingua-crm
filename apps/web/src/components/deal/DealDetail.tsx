'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ArrowLeft, Phone, Mail, Clock, Play, Plus, Pencil, Check, Trash2, Send, MessageSquarePlus, CheckCheck, AlertCircle, Loader2, Paperclip } from 'lucide-react'
import type { Deal, FieldDefinition } from '@crm/shared'
import { TRANSPORT_LABELS, TRANSPORT_EMOJI } from '@crm/shared'
import { dealsApi, fieldsApi, tasksApi, pipelinesApi, usersApi, contactsApi, emailAccountsApi, emailApi, integrationsApi } from '@/lib/api'
import { channelOptions, emailOptions, messageChannelLabel } from '@/lib/channelOptions'
import { CustomFieldsRenderer } from '../entity/CustomFieldsRenderer'
import { TagInput } from '../entity/TagInput'
import { cn, formatMoney, formatDateTime } from '@/lib/utils'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth.store'
import { NewMessageDialog } from './NewMessageDialog'
import { TrialLessonCard, type TrialItem } from './TrialLessonCard'
import { SubscriptionCard } from './SubscriptionCard'
import LostReasonDialog from './LostReasonDialog'

interface Props {
  dealId: string
  onClose: () => void
  onUpdated: (deal: Deal) => void
}

type Tab = 'main' | 'info' | 'tasks' | 'messages' | 'calls' | 'activity'

type MessageItem = {
  id: string; channel: string; direction: string; content: string; createdAt: string
  status?: string; errorMsg?: string | null
  channelId?: string | null; chatId?: string | null
  subject?: string | null
  attachments?: { id: string; filename: string; mimeType: string; size: number }[]
}

export function DealDetail({ dealId, onClose, onUpdated }: Props) {
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore(s => s.user?.permissions?.includes('trash.manage') ?? false)
  const canEdit = useAuthStore(s => s.user?.permissions?.includes('entities.edit') ?? false)
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState('')
  const [stageId, setStageId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<Array<{ key: string; label: string }>>([])
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [showLostDialog, setShowLostDialog] = useState(false)

  // Real-time message status and edited content (updated by socket, works regardless of active tab)
  const [statusMap, setStatusMap] = useState<Record<string, { status: string; errorMsg?: string | null }>>({})
  const [editedContentMap, setEditedContentMap] = useState<Record<string, string>>({})

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ['deal', dealId],
    queryFn: () => dealsApi.get(dealId),
    // Always refetch on open: the stage may have changed from the kanban
    // while the cached copy is still within staleTime
    refetchOnMount: 'always',
  })

  const { data: fieldDefs = [] } = useQuery<FieldDefinition[]>({
    queryKey: ['fields', 'deal'],
    queryFn: () => fieldsApi.list({ entityType: 'deal' }),
  })

  const { data: allPipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.list(),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const { data: tagSuggestions = [] } = useQuery({
    queryKey: ['deals', 'tags'],
    queryFn: () => dealsApi.tags(),
  })

  useEffect(() => {
    if (deal) {
      setTitle(deal.title)
      setBudget(deal.budget != null ? String(deal.budget) : '')
      setStageId(deal.stageId)
      setAssigneeId(deal.assigneeId ?? '')
      setTags(deal.tags ?? [])
      setCustomFields(deal.custom_fields as Record<string, unknown>)
      setIsDirty(false)
    }
  }, [deal])

  // Socket: join deal room + handle real-time events
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join:deal', dealId)

    const onNewMessage = ({ dealId: d }: { dealId: string }) => {
      if (d === dealId) queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
    }
    const onMessageStatus = ({ dealId: d, messageId, status, errorMsg }: {
      dealId: string; messageId: string; status: string; errorMsg?: string
    }) => {
      if (d === dealId) setStatusMap(prev => ({ ...prev, [messageId]: { status, errorMsg } }))
    }
    const onMessageEdited = ({ dealId: d, messageId, content }: {
      dealId: string; messageId: string; content: string
    }) => {
      if (d === dealId) setEditedContentMap(prev => ({ ...prev, [messageId]: content }))
    }
    const onTrialUpdated = ({ dealId: d }: { dealId: string }) => {
      if (d === dealId) queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
    }
    const onSubscriptionUpdated = ({ dealId: d, contactId }: { dealId: string | null; contactId: string }) => {
      if (d === dealId) {
        queryClient.invalidateQueries({ queryKey: ['subscriptions', 'contact', contactId] })
        queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      }
    }
    const onPaymentReceived = ({ dealId: d }: { dealId: string }) => {
      if (d === dealId) {
        queryClient.invalidateQueries({ queryKey: ['payments', 'deal', dealId] })
        queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      }
    }

    socket.on('NEW_MESSAGE', onNewMessage)
    socket.on('MESSAGE_STATUS', onMessageStatus)
    socket.on('MESSAGE_EDITED', onMessageEdited)
    socket.on('TRIAL_UPDATED', onTrialUpdated)
    socket.on('SUBSCRIPTION_UPDATED', onSubscriptionUpdated)
    socket.on('PAYMENT_RECEIVED', onPaymentReceived)

    return () => {
      socket.emit('leave:deal', dealId)
      socket.off('NEW_MESSAGE', onNewMessage)
      socket.off('MESSAGE_STATUS', onMessageStatus)
      socket.off('MESSAGE_EDITED', onMessageEdited)
      socket.off('TRIAL_UPDATED', onTrialUpdated)
      socket.off('SUBSCRIPTION_UPDATED', onSubscriptionUpdated)
      socket.off('PAYMENT_RECEIVED', onPaymentReceived)
    }
  }, [dealId, queryClient])

  const updateMutation = useMutation({
    mutationFn: async (lost?: { lostReasonId: string; lostComment?: string }) => {
      if (stageId !== deal!.stageId) {
        await dealsApi.moveStage(dealId, { stageId, ...lost })
      }
      return dealsApi.update(dealId, {
        title: title.trim(),
        budget: budget ? Number(budget) : undefined,
        assigneeId: assigneeId || undefined,
        tags,
        custom_fields: customFields,
      })
    },
    onSuccess: (updated) => {
      setSaveError(null)
      setRequiredFieldErrors([])
      setShowLostDialog(false)
      queryClient.setQueryData(['deal', dealId], updated)
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      onUpdated(updated)
      setIsDirty(false)
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { status: number; data?: { error: string; fields?: Array<{ key: string; label: string }> } } }
      setShowLostDialog(false)
      if (axErr.response?.status === 422 && axErr.response.data?.error === 'required_fields') {
        setRequiredFieldErrors(axErr.response.data.fields ?? [])
        setSaveError('Заполните обязательные поля для перехода в этот этап')
      } else if (axErr.response?.status === 422 && axErr.response.data?.error === 'lost_reason_required') {
        // Страховка: этап стал lost уже после загрузки списка воронок
        setRequiredFieldErrors([])
        setSaveError(null)
        setShowLostDialog(true)
      } else {
        setRequiredFieldErrors([])
        setSaveError(err instanceof Error ? err.message : 'Неизвестная ошибка')
      }
    },
  })

  // Мягкое удаление в корзину (только админ); восстановление — на странице «Корзина»
  const deleteMutation = useMutation({
    mutationFn: () => dealsApi.delete(dealId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['deal', dealId] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      onClose()
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : 'Не удалось удалить сделку')
    },
  })

  const markDirty = () => setIsDirty(true)

  const handleFieldChange = (key: string, value: unknown) => {
    setCustomFields(prev => ({ ...prev, [key]: value }))
    markDirty()
  }

  const findStageType = (id: string): string | undefined =>
    (allPipelines as Array<{ stages: Array<{ id: string; type?: string }> }>)
      .flatMap(p => p.stages)
      .find(s => s.id === id)?.type

  const handleSave = () => {
    // Перенос в lost-этап — сначала диалог причины, mutate вызовет его confirm
    if (deal && stageId !== deal.stageId && findStageType(stageId) === 'lost') {
      setShowLostDialog(true)
      return
    }
    updateMutation.mutate(undefined)
  }

  const handleCancel = () => {
    if (!deal) return
    setTitle(deal.title)
    setBudget(deal.budget != null ? String(deal.budget) : '')
    setStageId(deal.stageId)
    setAssigneeId(deal.assigneeId ?? '')
    setTags(deal.tags ?? [])
    setCustomFields(deal.custom_fields as Record<string, unknown>)
    setIsDirty(false)
    setSaveError(null)
  }

  if (isLoading || !deal) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Загрузка...
      </div>
    )
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'main', label: 'Основное' },
    { id: 'info', label: 'Доп. инфо' },
    { id: 'tasks', label: 'Задачи', count: deal.tasks?.filter((t) => !t.completed).length },
    { id: 'messages', label: 'Сообщения', count: deal._count?.messages },
    { id: 'calls', label: 'Звонки', count: deal._count?.calls },
    { id: 'activity', label: 'Активность' },
  ]

  // Общая панель сохранения: основные поля и кастомные поля («Доп. инфо»)
  // сохраняются одной мутацией, поэтому панель рендерится на обеих вкладках
  const saveBar = (
    <>
      {saveError && (
        <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md space-y-1">
          <p>{saveError}</p>
          {requiredFieldErrors.length > 0 && (
            <ul className="list-disc list-inside text-xs">
              {requiredFieldErrors.map(f => <li key={f.key}>{f.label}</li>)}
            </ul>
          )}
        </div>
      )}
      {isDirty && canEdit && (
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            Отменить
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !title.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <div className="w-full bg-white h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <button onClick={onClose} className="p-1.5 mt-0.5 rounded-md hover:bg-gray-100 shrink-0">
              <ArrowLeft className="h-4 w-4 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <input
                className="w-full text-base font-semibold text-gray-900 bg-transparent border-0 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white rounded px-1 -mx-1 truncate"
                value={title}
                onChange={e => { setTitle(e.target.value); markDirty() }}
              />
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: deal.stage?.color }}
                >
                  {deal.stage?.name}
                </span>
                {deal.budget && (
                  <span className="text-xs font-medium text-gray-500">
                    {formatMoney(Number(deal.budget))}
                  </span>
                )}
                {deal.stage?.type === 'lost' && deal.lostReason && (
                  <span className="text-xs text-red-600" title={deal.lostComment ?? undefined}>
                    Причина: {deal.lostReason.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4 shrink-0">
            {isDirty && canEdit && (
              <>
                <button
                  onClick={handleCancel}
                  className="px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Отменить
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !title.trim()}
                  className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </button>
              </>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm(`Удалить сделку «${deal.title}»? Она попадёт в корзину и будет храниться там 30 дней.`)) {
                    deleteMutation.mutate()
                  }
                }}
                disabled={deleteMutation.isPending}
                className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
                title="Удалить в корзину"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1 px-3 py-2.5 text-sm border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 rounded px-1">{tab.count}</span>
              )}
            </button>
          ))}
          <div className="ml-auto pl-2">
            {deal.contact ? (
              <button
                onClick={() => setShowNewMessage(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Написать
              </button>
            ) : (
              <span title="Добавьте контакт к сделке" className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-md cursor-not-allowed">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Написать
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'main' && (
            <div className="p-6 space-y-4 max-w-3xl">
              {/* Core fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Бюджет, ₽</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="0"
                    value={budget}
                    onChange={e => { setBudget(e.target.value); markDirty() }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Этап</label>
                  <select
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={stageId}
                    onChange={e => { setStageId(e.target.value); markDirty() }}
                  >
                    {allPipelines.length > 0
                      ? allPipelines.map((p: { id: string; name: string; stages: { id: string; name: string }[] }) => (
                          <optgroup key={p.id} label={p.name}>
                            {p.stages.map((s: { id: string; name: string }) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </optgroup>
                        ))
                      : (deal.stage ? [deal.stage] : []).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))
                    }
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ответственный</label>
                  <select
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={assigneeId}
                    onChange={e => { setAssigneeId(e.target.value); markDirty() }}
                  >
                    <option value="">— не назначен —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                {deal.contact ? (
                  <ContactInlineCard dealId={dealId} contact={deal.contact as unknown as ContactWithPhones} />
                ) : (
                  <AttachContactCard dealId={dealId} onAttached={onUpdated} />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Теги</label>
                <TagInput
                  value={tags}
                  onChange={next => { setTags(next); markDirty() }}
                  suggestions={tagSuggestions}
                  disabled={!canEdit}
                />
              </div>

              {/* Пробный урок */}
              <TrialLessonCard
                dealId={dealId}
                trials={((deal as unknown as { trials?: TrialItem[] }).trials) ?? []}
                contact={deal.contact as unknown as ContactWithPhones | null}
              />

              {/* Абонемент */}
              {deal.contact && (
                <SubscriptionCard contactId={deal.contact.id} dealId={dealId} />
              )}

              {saveBar}
            </div>
          )}

          {activeTab === 'info' && (
            <div className="p-6 space-y-4 max-w-3xl">
              {fieldDefs.length > 0 ? (
                <CustomFieldsRenderer
                  fields={fieldDefs}
                  values={customFields}
                  onChange={handleFieldChange}
                />
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">
                  Нет дополнительных полей. Добавьте их в Настройки → Поля.
                </p>
              )}
              {saveBar}
            </div>
          )}

          {activeTab === 'tasks' && (
            <TasksTab deal={deal} />
          )}

          {activeTab === 'messages' && (
            <MessagesTab
              deal={deal as unknown as Deal & { messages?: MessageItem[]; contact?: ContactWithPhones | null }}
              dealId={dealId}
              statusMap={statusMap}
              editedContentMap={editedContentMap}
            />
          )}

          {activeTab === 'calls' && (
            <CallsTab deal={deal} />
          )}

          {activeTab === 'activity' && (
            <ActivityTab deal={deal} />
          )}
        </div>
      </div>

      {showNewMessage && deal.contact && (
        <NewMessageDialog
          dealId={dealId}
          contact={deal.contact as unknown as Parameters<typeof NewMessageDialog>[0]['contact']}
          onClose={() => setShowNewMessage(false)}
        />
      )}

      {showLostDialog && (
        <LostReasonDialog
          onConfirm={(lostReasonId, lostComment) => updateMutation.mutate({ lostReasonId, lostComment })}
          onCancel={() => setShowLostDialog(false)}
          isPending={updateMutation.isPending}
        />
      )}
    </>
  )
}

// --- Attach contact card (сделка без контакта — привязать существующий или создать нового) ---

function AttachContactCard({ dealId, onAttached }: { dealId: string; onAttached: (deal: Deal) => void }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'search' | 'create' | null>(null)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [duplicates, setDuplicates] = useState<{ id: string; name: string; phone?: string | null; email?: string | null }[] | null>(null)

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', 'search', search],
    queryFn: () => contactsApi.list({ search, limit: 10 }),
    enabled: mode === 'search' && search.length >= 2,
  })
  const results = contactsData?.contacts ?? []

  const attachMutation = useMutation({
    mutationFn: (contactId: string) => dealsApi.update(dealId, { contactId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['deal', dealId], updated)
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      onAttached(updated)
      setMode(null)
      setSearch('')
    },
  })

  const createMutation = useMutation({
    mutationFn: async (force?: boolean) => {
      const contact = await contactsApi.create({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        force,
      })
      return dealsApi.update(dealId, { contactId: contact.id })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['deal', dealId], updated)
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      onAttached(updated)
      setMode(null)
      setName('')
      setPhone('')
      setEmail('')
      setDuplicates(null)
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { status: number; data?: { error: string; matches?: { id: string; name: string; phone?: string | null; email?: string | null }[] } } }
      if (axErr.response?.status === 409 && axErr.response.data?.error === 'duplicate_contact') {
        setDuplicates(axErr.response.data.matches ?? [])
      }
    },
  })

  if (mode === null) {
    return (
      <div className="col-span-2 p-3 rounded-lg border border-dashed border-gray-200 text-center">
        <p className="text-xs text-gray-400 mb-2">К сделке не привязан контакт</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setMode('search')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Привязать контакт
          </button>
          <button
            onClick={() => setMode('create')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Новый контакт
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'search') {
    return (
      <div className="col-span-2 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <p className="text-xs font-medium text-gray-500">Найти и привязать контакт</p>
        <input
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          placeholder="Начните вводить имя..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="border border-gray-200 rounded-md bg-white shadow-sm overflow-hidden max-h-36 overflow-y-auto">
            {results.map((c: { id: string; name: string; phone?: string | null }) => (
              <button
                key={c.id}
                type="button"
                disabled={attachMutation.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-50"
                onClick={() => attachMutation.mutate(c.id)}
              >
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.phone && <span className="text-gray-400">{c.phone}</span>}
              </button>
            ))}
          </div>
        )}
        {search.length >= 2 && results.length === 0 && (
          <p className="text-xs text-gray-400">Ничего не найдено</p>
        )}
        {attachMutation.isError && <p className="text-xs text-red-500">Не удалось привязать контакт</p>}
        <div className="flex justify-end">
          <button onClick={() => { setMode(null); setSearch('') }} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">
            Отмена
          </button>
        </div>
      </div>
    )
  }

  if (duplicates && duplicates.length > 0) {
    return (
      <div className="col-span-2 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
          Похожий контакт уже есть — совпадает телефон или email
        </p>
        <div className="space-y-1.5">
          {duplicates.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-sm">
              <div>
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.phone && <span className="text-gray-400 ml-2">{c.phone}</span>}
                {c.email && <span className="text-gray-400 ml-2">{c.email}</span>}
              </div>
              <button
                disabled={attachMutation.isPending}
                onClick={() => attachMutation.mutate(c.id)}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                Привязать
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => { setMode(null); setDuplicates(null) }} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">
            Отмена
          </button>
          <button
            onClick={() => createMutation.mutate(true)}
            disabled={createMutation.isPending}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Всё равно создать
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="col-span-2 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
      <p className="text-xs font-medium text-gray-500">Новый контакт</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Имя</label>
          <input
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Телефон</label>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="+7 999 123-45-67"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input
            type="email"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
      </div>
      {createMutation.isError && <p className="text-xs text-red-500">Не удалось создать контакт</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setMode(null)} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">
          Отмена
        </button>
        <button
          onClick={() => createMutation.mutate(false)}
          disabled={!name.trim() || createMutation.isPending}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Создание...' : 'Создать и привязать'}
        </button>
      </div>
    </div>
  )
}

// --- Contact inline card (просмотр + редактирование данных контакта из сделки) ---

type ContactWithPhones = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  telegramUsername?: string | null
  deletedAt?: string | null
  phones: { id: string; phone: string; label?: string | null }[]
  emails: { id: string; email: string; label?: string | null }[]
  channels: { id: string; transport: string; chatId: string }[]
}

function ContactInlineCard({ dealId, contact }: { dealId: string; contact: ContactWithPhones }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(contact.name)
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [telegram, setTelegram] = useState(contact.telegramUsername ?? '')

  const updateMutation = useMutation({
    mutationFn: () =>
      contactsApi.update(contact.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        telegramUsername: telegram.trim().replace(/^@/, '') || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contact', contact.id] })
      setEditing(false)
    },
  })

  const startEdit = () => {
    setName(contact.name)
    setPhone(contact.phone ?? '')
    setEmail(contact.email ?? '')
    setTelegram(contact.telegramUsername ?? '')
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="col-span-2 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <p className="text-xs font-medium text-gray-500">Контакт</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Имя</label>
            <input
              autoFocus
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Телефон (основной)</label>
            <input
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              placeholder="+7 999 123-45-67"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Telegram</label>
            <input
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              placeholder="@username"
              value={telegram}
              onChange={e => setTelegram(e.target.value)}
            />
          </div>
        </div>
        {updateMutation.isError && <p className="text-xs text-red-500">Не удалось сохранить контакт</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
          >
            Отмена
          </button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="col-span-2 group/contact">
      <p className="text-xs font-medium text-gray-500 mb-1">Контакт</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-gray-900">{contact.name}</p>
        {contact.deletedAt && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600" title="Контакт удалён — его можно восстановить на странице «Корзина»">
            в корзине
          </span>
        )}
        <button
          onClick={startEdit}
          title="Редактировать контакт"
          className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover/contact:opacity-100 transition-opacity"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <ContactPhonesInline contactId={contact.id} dealId={dealId} contact={contact} />
      <ContactEmailsInline contactId={contact.id} dealId={dealId} contact={contact} />
    </div>
  )
}

// --- Contact phones inline widget ---

function ContactPhonesInline({ contactId, dealId, contact }: { contactId: string; dealId: string; contact: ContactWithPhones }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newPhone, setNewPhone] = useState('')

  const addMutation = useMutation({
    mutationFn: () => contactsApi.addPhone(contactId, newPhone.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      setNewPhone('')
      setAdding(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (phoneId: string) => contactsApi.removePhone(contactId, phoneId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', dealId] }),
  })

  const allPhones = [
    ...(contact.phone ? [{ id: '_main', phone: contact.phone, label: 'основной' }] : []),
    ...contact.phones,
  ]

  return (
    <div className="mt-1.5 space-y-1">
      {allPhones.map(p => (
        <div key={p.id} className="flex items-center gap-1.5 group">
          <Phone className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-600">{p.phone}</span>
          {p.label && <span className="text-xs text-gray-400">({p.label})</span>}
          {p.id !== '_main' && (
            <button
              onClick={() => removeMutation.mutate(p.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 transition-opacity"
            >
              <X className="h-3 w-3 text-red-400" />
            </button>
          )}
        </div>
      ))}
      {contact.telegramUsername && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs">✈️</span>
          <span className="text-xs text-gray-600">@{contact.telegramUsername}</span>
        </div>
      )}
      {adding ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="text-xs px-2 py-1 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="+7 999 123-45-67"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newPhone.trim()) addMutation.mutate(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button onClick={() => { if (newPhone.trim()) addMutation.mutate() }} disabled={!newPhone.trim()} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">+</button>
          <button onClick={() => setAdding(false)} className="text-xs px-1.5 py-1 text-gray-400 hover:bg-gray-100 rounded">✕</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
          <Plus className="h-3 w-3" /> Добавить телефон
        </button>
      )}
    </div>
  )
}

// --- Contact emails inline widget ---

function ContactEmailsInline({ contactId, dealId, contact }: { contactId: string; dealId: string; contact: ContactWithPhones }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  const addMutation = useMutation({
    mutationFn: () => contactsApi.addEmail(contactId, newEmail.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      setNewEmail('')
      setAdding(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (emailId: string) => contactsApi.removeEmail(contactId, emailId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', dealId] }),
  })

  const allEmails = [
    ...(contact.email ? [{ id: '_main', email: contact.email, label: 'основной' }] : []),
    ...(contact.emails ?? []),
  ]

  return (
    <div className="mt-1.5 space-y-1">
      {allEmails.map(e => (
        <div key={e.id} className="flex items-center gap-1.5 group">
          <Mail className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-600">{e.email}</span>
          {e.label && <span className="text-xs text-gray-400">({e.label})</span>}
          {e.id !== '_main' && (
            <button
              onClick={() => removeMutation.mutate(e.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 transition-opacity"
            >
              <X className="h-3 w-3 text-red-400" />
            </button>
          )}
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="email"
            className="text-xs px-2 py-1 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="ivan@example.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newEmail.trim()) addMutation.mutate(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button onClick={() => { if (newEmail.trim()) addMutation.mutate() }} disabled={!newEmail.trim()} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">+</button>
          <button onClick={() => setAdding(false)} className="text-xs px-1.5 py-1 text-gray-400 hover:bg-gray-100 rounded">✕</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
          <Plus className="h-3 w-3" /> Добавить email
        </button>
      )}
      {addMutation.isError && <p className="text-xs text-red-500">Не удалось добавить email</p>}
    </div>
  )
}

// --- Tasks tab ---

type TaskItem = {
  id: string
  title: string
  completed: boolean
  result?: string | null
  dueDate?: string | null
  assigneeId?: string | null
  assignee?: { id: string; name: string } | null
}

function TaskRow({ task, users, onToggle, onComplete, onSave, onDelete }: {
  task: TaskItem
  users: Array<{ id: string; name: string }>
  onToggle: (id: string, completed: boolean) => void
  onComplete: (id: string, result: string) => void
  onSave: (id: string, title: string, dueDate: string, assigneeId: string, result?: string) => void
  onDelete: (id: string) => void
}) {
  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDueDate, setEditDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''
  )
  const [editAssigneeId, setEditAssigneeId] = useState(task.assigneeId ?? '')
  const [editResult, setEditResult] = useState(task.result ?? '')

  const handleSave = () => {
    if (editTitle.trim()) {
      onSave(task.id, editTitle.trim(), editDueDate, editAssigneeId, task.completed ? editResult.trim() : undefined)
      setEditing(false)
    }
  }

  const startEdit = () => {
    setEditTitle(task.title)
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '')
    setEditAssigneeId(task.assigneeId ?? '')
    setEditResult(task.result ?? '')
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <input
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
        />
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={editDueDate}
            onChange={e => setEditDueDate(e.target.value)}
          />
          <select
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={editAssigneeId}
            onChange={e => setEditAssigneeId(e.target.value)}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        {task.completed && (
          <textarea
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="Результат выполнения"
            value={editResult}
            onChange={e => setEditResult(e.target.value)}
          />
        )}
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleSave} className="p-1.5 text-blue-600 hover:text-blue-700 rounded">
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border group', task.completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200')}>
      <button
        onClick={() => task.completed ? onToggle(task.id, task.completed) : setCompleting(true)}
        title={task.completed ? 'Переоткрыть задачу' : 'Закрыть задачу'}
        className={cn(
          'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          task.completed
            ? 'bg-green-500 border-green-500 hover:bg-gray-300 hover:border-gray-300'
            : 'border-gray-300 hover:border-blue-500'
        )}
      >
        {task.completed && <span className="text-white text-xs">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', task.completed && 'line-through text-gray-400')}>{task.title}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {task.dueDate && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDateTime(task.dueDate)}
            </span>
          )}
          {task.assignee && (
            <span className="text-xs text-gray-400">{task.assignee.name}</span>
          )}
        </div>
        {task.completed && task.result && (
          <p className="text-xs text-gray-500 mt-1">Результат: {task.result}</p>
        )}
        {completing && (
          <div className="mt-2 space-y-1.5">
            <textarea
              autoFocus
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Результат выполнения (обязательно)"
              value={result}
              onChange={e => setResult(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCompleting(false); setResult('') }} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">Отмена</button>
              <button
                onClick={() => { if (result.trim()) { onComplete(task.id, result.trim()); setCompleting(false); setResult('') } }}
                disabled={!result.trim()}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Завершить
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={startEdit} className="p-1 text-gray-300 hover:text-gray-500">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function TasksTab({ deal }: { deal: Deal }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      tasksApi.update(id, { completed: !completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', deal.id] }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) =>
      tasksApi.update(id, { completed: true, result }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', deal.id] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, title, dueDate, assigneeId, result }: { id: string; title: string; dueDate: string; assigneeId: string; result?: string }) =>
      tasksApi.update(id, {
        title,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeId: assigneeId || undefined,
        ...(result !== undefined && { result }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', deal.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', deal.id] }),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const assignee = taskAssigneeId || (users as Array<{ id: string }>)[0]?.id
      if (!assignee) throw new Error('Нет доступных пользователей')
      return tasksApi.create({
        title: taskTitle.trim(),
        dealId: deal.id,
        assigneeId: assignee,
        dueDate: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id] })
      setTaskTitle('')
      setTaskDueDate('')
      setShowForm(false)
    },
  })

  return (
    <div className="p-6">
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить задачу
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
          <input
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="Название задачи"
            value={taskTitle}
            onChange={e => setTaskTitle(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Срок</label>
              <input
                type="datetime-local"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={taskDueDate}
                onChange={e => setTaskDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ответственный</label>
              <select
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={taskAssigneeId}
                onChange={e => setTaskAssigneeId(e.target.value)}
              >
                {(users as Array<{ id: string; name: string }>).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          {createMutation.isError && <p className="text-xs text-red-500">Ошибка при создании задачи</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">Отмена</button>
            <button
              onClick={() => { if (taskTitle.trim()) createMutation.mutate() }}
              disabled={!taskTitle.trim() || createMutation.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {deal.tasks?.map((task: TaskItem) => (
          <TaskRow
            key={task.id}
            task={task as TaskItem}
            users={users as Array<{ id: string; name: string }>}
            onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
            onComplete={(id, result) => completeMutation.mutate({ id, result })}
            onSave={(id, title, dueDate, assigneeId, result) => updateMutation.mutate({ id, title, dueDate, assigneeId, result })}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ))}
        {!deal.tasks?.length && !showForm && (
          <p className="text-sm text-gray-400 text-center py-8">Нет задач</p>
        )}
      </div>
    </div>
  )
}

// --- Messages tab ---
// Словари транспортов — общие, из @crm/shared (включая 'sms')
const TRANSPORT_LABEL = TRANSPORT_LABELS

function MessageStatus({ status }: { status?: string }) {
  if (!status || status === 'sent') return <Check className="h-3 w-3 inline-block ml-1 opacity-60" />
  if (status === 'sending') return <Loader2 className="h-3 w-3 inline-block ml-1 opacity-60 animate-spin" />
  if (status === 'scheduled') return <Clock className="h-3 w-3 inline-block ml-1 opacity-60" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 inline-block ml-1 opacity-60" />
  if (status === 'read') return <CheckCheck className="h-3 w-3 inline-block ml-1 text-blue-300" />
  if (status === 'error') return <AlertCircle className="h-3 w-3 inline-block ml-1 text-red-300" />
  return null
}

function EmailAttachmentLink({ attachment }: { attachment: { id: string; filename: string } }) {
  const openMutation = useMutation({
    mutationFn: () => emailApi.attachmentUrl(attachment.id),
    onSuccess: ({ url }) => window.open(url, '_blank'),
  })
  return (
    <button
      onClick={() => openMutation.mutate()}
      disabled={openMutation.isPending}
      className="flex items-center gap-1 text-xs underline opacity-90 hover:opacity-100 disabled:opacity-50"
    >
      <Paperclip className="h-3 w-3" />
      {attachment.filename}
    </button>
  )
}

interface MessagesTabProps {
  deal: Deal & { messages?: MessageItem[]; contact?: ContactWithPhones | null }
  dealId: string
  statusMap: Record<string, { status: string; errorMsg?: string | null }>
  editedContentMap: Record<string, string>
}

function MessagesTab({ deal, dealId, statusMap, editedContentMap }: MessagesTabProps) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [channelKeyState, setChannelKeyState] = useState<string>('')
  const [smsTemplateId, setSmsTemplateId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [subject, setSubject] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [emailAccountId, setEmailAccountId] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Messages arrive newest-first from API — reverse for chronological display
  const messages = [...(deal.messages ?? [])].reverse()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Build channel options from contact's known channels (history only)
  const contact = deal.contact
  const contactChannels = contact?.channels ?? []

  const { data: emailAccounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => emailAccountsApi.list(),
  })
  const { data: channelData } = useQuery({
    queryKey: ['integrations', 'wazzup'],
    queryFn: () => integrationsApi.wazzupChannels(),
  })

  // Каналы из истории переписки контакта, отфильтрованные до реально активных в WazzUp —
  // иначе селектор молча предлагает отправку через отключённый канал (см. замечание 44)
  const activeWazzupTransports = new Set(
    (channelData?.channels ?? []).filter(ch => ch.state === 'active').map(ch => ch.transport)
  )
  const sendableChannels: { key: string; transport: string; chatId: string; label: string }[] = contactChannels
    .filter((c: { transport: string }) => activeWazzupTransports.has(c.transport))
    .map((c: { id: string; transport: string; chatId: string }) => ({
      key: `${c.transport}|${c.chatId}`,
      transport: c.transport,
      chatId: c.chatId,
      label: `${TRANSPORT_EMOJI[c.transport] ?? '📱'} ${TRANSPORT_LABEL[c.transport] ?? c.transport}`,
    }))

  // SMS — доступно по каждому телефону контакта (у SMS нет «установленного канала», в отличие
  // от WazzUp — см. lib/channelOptions.ts, тот же приём, что в TrialLessonCard/InvoiceDialog)
  const smsOptions = contact ? channelOptions(contact).filter(c => c.transport === 'sms') : []
  for (const sms of smsOptions) {
    sendableChannels.push({ key: sms.key, transport: sms.transport, chatId: sms.chatId, label: sms.label })
  }

  // Email — доступен, если у контакта есть хотя бы один адрес и есть доступный ящик
  const contactEmailOptions = contact ? emailOptions(contact) : []
  if (contactEmailOptions.length > 0 && emailAccounts.length > 0) {
    sendableChannels.push({ key: 'email', transport: 'email', chatId: contactEmailOptions[0].chatId, label: `${TRANSPORT_EMOJI.email} Email` })
  }

  const effectiveKey = channelKeyState || sendableChannels[0]?.key || ''
  const selectedChannel = sendableChannels.find(c => c.key === effectiveKey)
  const effectiveTransport = selectedChannel?.transport || ''
  const isEmail = effectiveTransport === 'email'
  const isSms = effectiveTransport === 'sms'

  const { data: smsTemplatesData } = useQuery({
    queryKey: ['integrations', 'targetsms', 'templates'],
    queryFn: () => integrationsApi.targetsmsTemplates(),
    enabled: isSms,
    retry: false,
  })
  const smsTemplates = smsTemplatesData?.templates ?? []
  const effectiveEmailAccountId = emailAccountId || emailAccounts[0]?.id || ''

  // Только Telegram Personal/MAX (tgapi/max) резолвят чат по номеру телефона через отдельное
  // поле запроса phone/username — см. wazzupClient.sendMessage и NewMessageDialog.tsx
  const supportsPhoneLookup = effectiveTransport === 'tgapi' || effectiveTransport === 'max'

  const resolveRecipient = (): { chatId: string; kind: 'chatId' | 'phone' | 'username' } => {
    if (selectedChannel?.chatId) return { chatId: selectedChannel.chatId, kind: 'chatId' }
    if (!contact) return { chatId: '', kind: 'chatId' }
    if ((effectiveTransport === 'tgapi' || effectiveTransport === 'telegram') && contact.telegramUsername)
      return { chatId: contact.telegramUsername.replace(/^@/, ''), kind: supportsPhoneLookup ? 'username' : 'chatId' }
    const phones = [contact.phone, ...contact.phones.map((p: { phone: string }) => p.phone)].filter(Boolean)
    return { chatId: phones[0]?.replace(/\D/g, '') ?? '', kind: supportsPhoneLookup ? 'phone' : 'chatId' }
  }

  const sendMutation = useMutation({
    mutationFn: () => {
      const { chatId: resolvedChatId, kind: recipientType } = resolveRecipient()
      if (isEmail) {
        const formData = new FormData()
        formData.append('accountId', effectiveEmailAccountId)
        formData.append('to', resolvedChatId)
        formData.append('subject', subject.trim())
        formData.append('body', text.trim())
        files.forEach(f => formData.append('files', f))
        return dealsApi.sendEmail(dealId, formData)
      }
      const iso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined
      return dealsApi.sendMessage(dealId, text.trim(), effectiveTransport, resolvedChatId, iso, recipientType)
    },
    onSuccess: (msg: MessageItem) => {
      queryClient.setQueryData(['deal', dealId], (old: Deal & { messages?: MessageItem[] }) => {
        if (!old) return old
        return { ...old, messages: [msg, ...(old.messages ?? [])] }
      })
      setText('')
      setSubject('')
      setFiles([])
      setScheduledAt('')
      setShowSchedule(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ messageId, newText }: { messageId: string; newText: string }) =>
      dealsApi.editMessage(dealId, messageId, newText),
    onSuccess: (_res, { messageId, newText }) => {
      // Update cache immediately
      queryClient.setQueryData(['deal', dealId], (old: Deal & { messages?: MessageItem[] }) => {
        if (!old) return old
        return {
          ...old,
          messages: (old.messages ?? []).map((m: MessageItem) =>
            m.id === messageId ? { ...m, content: newText } : m
          ),
        }
      })
      setEditingMsgId(null)
    },
  })

  const handleSend = () => {
    if (!text.trim() || sendMutation.isPending || !effectiveTransport) return
    if (isEmail && (!subject.trim() || !effectiveEmailAccountId)) return
    sendMutation.mutate()
  }

  const noContact = !contact
  const noChannels = sendableChannels.length === 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Нет сообщений</p>
        )}
        {messages.map(msg => {
          const live = statusMap[msg.id]
          const status = live?.status ?? msg.status
          const errorMsg = live?.errorMsg ?? msg.errorMsg
          const content = editedContentMap[msg.id] ?? msg.content
          const isOut = msg.direction === 'out'
          const isEditing = editingMsgId === msg.id

          return (
            <div key={msg.id} className={cn('flex flex-col', isOut ? 'items-end' : 'items-start')}>
              <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                {messageChannelLabel(msg.channel, msg.channelId, msg.chatId, channelData?.channels ?? [])}
              </span>

              {isEditing ? (
                <div className="max-w-xs w-full space-y-1">
                  <textarea
                    autoFocus
                    className="w-full px-3 py-2 text-sm border border-blue-400 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3}
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editingText.trim()) editMutation.mutate({ messageId: msg.id, newText: editingText.trim() }) }
                      if (e.key === 'Escape') setEditingMsgId(null)
                    }}
                  />
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditingMsgId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (editingText.trim()) editMutation.mutate({ messageId: msg.id, newText: editingText.trim() }) }}
                      disabled={!editingText.trim() || editMutation.isPending}
                      className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group relative max-w-xs">
                  <div className={cn('px-3 py-2 rounded-lg text-sm', isOut ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900')}>
                    {msg.channel === 'email' && msg.subject && (
                      <p className="font-semibold mb-1">{msg.subject}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{content}</p>
                    {!!msg.attachments?.length && (
                      <div className="mt-1.5 space-y-1">
                        {msg.attachments.map(att => <EmailAttachmentLink key={att.id} attachment={att} />)}
                      </div>
                    )}
                    <div className={cn('flex items-center justify-end gap-1 mt-0.5', isOut ? 'text-blue-200' : 'text-gray-400')}>
                      {(msg as { _demo?: boolean })._demo && <span title="Демо: не отправлено реальному получателю">🎭</span>}
                      <span className="text-xs">{formatDateTime(msg.createdAt)}</span>
                      {isOut && <MessageStatus status={status} />}
                    </div>
                  </div>
                  {/* Edit button — only for outgoing, when wazzup supports editing */}
                  {isOut && status !== 'error' && status !== 'scheduled' && (
                    <button
                      onClick={() => { setEditingMsgId(msg.id); setEditingText(content) }}
                      className="absolute -top-1 -right-1 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity border border-gray-100 text-gray-400 hover:text-gray-600"
                      title="Редактировать"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {isOut && status === 'error' && errorMsg && (
                <p className="text-xs text-red-500 mt-0.5 max-w-xs px-1">{errorMsg}</p>
              )}
              {isOut && status === 'scheduled' && msg.createdAt && (
                <p className="text-xs text-amber-500 mt-0.5 px-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Запланировано
                </p>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send area */}
      {noContact ? (
        <div className="border-t border-gray-100 p-4 text-sm text-amber-600 bg-amber-50 text-center">
          Добавьте контакт к сделке, чтобы отправлять сообщения
        </div>
      ) : noChannels ? (
        <div className="border-t border-gray-100 p-4 text-sm text-gray-500 text-center">
          {contactChannels.length > 0
            ? 'Каналы переписки из истории сейчас не активны в WazzUp. Проверьте подключение в Настройки → WazzUp.'
            : 'Переписки ещё не было. Используйте кнопку «Написать» для первого сообщения.'}
        </div>
      ) : (
        <div className="border-t border-gray-100 p-3 space-y-2">
          {/* Channel selector */}
          <div className="flex gap-1.5 flex-wrap">
            {sendableChannels.map(ch => (
              <button
                key={ch.key}
                onClick={() => setChannelKeyState(ch.key)}
                className={cn(
                  'text-xs px-2 py-1 rounded-md border transition-colors',
                  effectiveKey === ch.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {/* Email — отправить из (несколько ящиков) + тема + вложения */}
          {isEmail && (
            <div className="space-y-1.5">
              {emailAccounts.length > 1 && (
                <select
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={effectiveEmailAccountId}
                  onChange={e => setEmailAccountId(e.target.value)}
                >
                  {emailAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.label} ({a.emailAddress})</option>
                  ))}
                </select>
              )}
              <input
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Тема письма"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer w-fit">
                <Paperclip className="h-3.5 w-3.5" />
                <span>{files.length ? `${files.length} файл(ов)` : 'Прикрепить файлы'}</span>
                <input type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
              </label>
            </div>
          )}

          {/* SMS — выбор готового шаблона из TargetSMS вместо ручного набора текста */}
          {isSms && smsTemplates.length > 0 && (
            <select
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={smsTemplateId}
              onChange={e => {
                const id = e.target.value
                setSmsTemplateId(id)
                const tpl = smsTemplates.find(t => t.id === id)
                if (tpl) setText(contact ? tpl.text.replaceAll('{имя}', contact.name) : tpl.text)
              }}
            >
              <option value="">Свой текст...</option>
              {smsTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {/* Schedule picker */}
          {!isEmail && showSchedule && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <input
                type="datetime-local"
                className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={scheduledAt}
                min={new Date().toISOString().slice(0, 16)}
                onChange={e => setScheduledAt(e.target.value)}
              />
              <button
                onClick={() => { setScheduledAt(''); setShowSchedule(false) }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              placeholder={isEmail ? 'Текст письма...' : 'Написать сообщение...'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (!isEmail && e.key === 'Enter' && !e.shiftKey && !scheduledAt) { e.preventDefault(); handleSend() } }}
            />
            <div className="flex flex-col gap-1 self-end">
              {!isEmail && (
                <button
                  onClick={() => setShowSchedule(v => !v)}
                  title="Отложенная отправка"
                  className={cn(
                    'p-2 rounded-md border transition-colors',
                    showSchedule
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                  )}
                >
                  <Clock className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!text.trim() || sendMutation.isPending || !effectiveTransport || (isEmail && (!subject.trim() || !effectiveEmailAccountId))}
                title={scheduledAt && !isEmail ? `Запланировать на ${scheduledAt}` : 'Отправить'}
                className={cn(
                  'p-2 text-white rounded-md disabled:opacity-50 transition-colors',
                  scheduledAt && !isEmail ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Calls tab ---

type CallItem = { id: string; direction: string; duration?: number | null; recordUrl?: string | null; createdAt: string }

function CallsTab({ deal }: { deal: Deal & { calls?: CallItem[] } }) {
  return (
    <div className="p-6 space-y-2">
      {deal.calls?.map((call: CallItem) => (
        <div key={call.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-white">
          <div className={cn('p-1.5 rounded-full', call.direction === 'in' ? 'bg-green-100' : 'bg-blue-100')}>
            <Phone className={cn('h-3.5 w-3.5', call.direction === 'in' ? 'text-green-600' : 'text-blue-600')} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">{call.direction === 'in' ? 'Входящий' : 'Исходящий'}</p>
            {call.duration && (
              <p className="text-xs text-gray-400">{Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}</p>
            )}
          </div>
          <p className="text-xs text-gray-400">{formatDateTime(call.createdAt)}</p>
          {call.recordUrl && (
            <a href={call.recordUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-100">
              <Play className="h-3.5 w-3.5 text-gray-400" />
            </a>
          )}
        </div>
      ))}
      {!deal.calls?.length && (
        <p className="text-sm text-gray-400 text-center py-8">Нет звонков</p>
      )}
    </div>
  )
}

// --- Activity tab ---

type ActivityItem = { id: string; type: string; payload: Record<string, unknown>; createdAt: string }

function ActivityTab({ deal }: { deal: Deal & { activities?: ActivityItem[] } }) {
  const typeLabel: Record<string, string> = {
    deal_created: 'Сделка создана',
    deal_updated: 'Сделка обновлена',
    stage_change: 'Смена этапа',
    call: 'Звонок',
    note: 'Заметка',
    task_completed: 'Задача выполнена',
  }

  return (
    <div className="p-6 space-y-3">
      {deal.activities?.map((act: ActivityItem) => (
        <div key={act.id} className="flex gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
          <div>
            <p className="text-sm text-gray-700">
              {typeLabel[act.type] ?? act.type}
              {act.type === 'task_completed' && act.payload.title ? `: ${String(act.payload.title)}` : ''}
            </p>
            {act.type === 'task_completed' && act.payload.result ? (
              <p className="text-xs text-gray-500">Результат: {String(act.payload.result)}</p>
            ) : null}
            <p className="text-xs text-gray-400">{formatDateTime(act.createdAt)}</p>
          </div>
        </div>
      ))}
      {!deal.activities?.length && (
        <p className="text-sm text-gray-400 text-center py-8">Нет активности</p>
      )}
    </div>
  )
}
