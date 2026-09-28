'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CreditCard, ChevronDown, ChevronRight, Copy, Receipt } from 'lucide-react'
import { subscriptionsApi, packagesApi, usersApi, paymentsApi } from '@/lib/api'
import { cn, formatMoney, formatDateTime } from '@/lib/utils'
import type { Subscription, Package, Lesson, Payment } from '@crm/shared'
import InvoiceDialog from './InvoiceDialog'
import { useHasPermission } from '@/store/auth.store'

interface Props {
  contactId: string
  dealId?: string
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  exhausted: 'Исчерпан',
  expired: 'Истёк',
  canceled: 'Отменён',
}

const LESSON_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Запланирован',
  completed: 'Проведён',
  canceled: 'Отменён',
  no_show: 'Не пришёл',
}

function toISO(local: string) {
  // datetime-local отдаёт "2026-07-04T10:00" без таймзоны — Zod требует полный ISO
  return new Date(local).toISOString()
}

export function SubscriptionCard({ contactId, dealId }: Props) {
  const queryClient = useQueryClient()
  const canFinance = useHasPermission('finance.manage')
  const [showCreate, setShowCreate] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: subscriptions = [] } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'contact', contactId],
    queryFn: () => subscriptionsApi.list({ contactId }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subscriptions', 'contact', contactId] })
    if (dealId) queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
  }
  const onError = (err: unknown) => {
    const axErr = err as { response?: { data?: { message?: string; error?: string } } }
    setError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Ошибка')
  }

  const lessonMutation = useMutation({
    mutationFn: ({ subId, lessonId, status }: { subId: string; lessonId: string; status: 'completed' | 'no_show' | 'canceled' }) =>
      subscriptionsApi.updateLesson(subId, lessonId, { status }),
    onSuccess: () => { setError(null); invalidate() },
    onError,
  })

  const cancelMutation = useMutation({
    mutationFn: (subId: string) => subscriptionsApi.update(subId, { status: 'canceled' }),
    onSuccess: () => { setError(null); invalidate() },
    onError,
  })

  const active = subscriptions.filter(s => s.effectiveStatus === 'active')
  const history = subscriptions.filter(s => s.effectiveStatus !== 'active')

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <CreditCard className="h-3.5 w-3.5" />
          Абонемент
        </h3>
        <div className="flex items-center gap-2">
          {dealId && canFinance && (
            <button
              onClick={() => setShowInvoice(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Receipt className="h-3.5 w-3.5" />
              Выставить счёт
            </button>
          )}
          {canFinance && <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить вручную
          </button>}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-2.5 py-1.5 rounded-md mb-2">{error}</p>
      )}

      {showCreate && (
        <CreateSubscriptionForm
          contactId={contactId}
          dealId={dealId}
          onDone={() => { setShowCreate(false); setError(null); invalidate() }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {subscriptions.length === 0 && !showCreate && (
        <p className="text-xs text-gray-400">Нет абонементов</p>
      )}

      {active.map(sub => (
        <div key={sub.id} className="bg-white border border-gray-100 rounded-lg p-3 mb-1.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{sub.packageName}</p>
              <p className="text-xs text-gray-400">
                {formatMoney(Number(sub.price))}
                {sub.expiresAt ? ` · до ${formatDateTime(sub.expiresAt).split(',')[0]}` : ' · бессрочный'}
              </p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className={cn('text-sm font-bold', sub.balance <= 2 ? 'text-red-600' : 'text-green-600')}>
                {sub.balance} из {sub.lessonsTotal}
              </p>
              <p className="text-[10px] text-gray-400">уроков осталось</p>
            </div>
          </div>

          <LessonsBlock
            sub={sub}
            expanded={expandedId === sub.id}
            onToggle={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
            addingLesson={addingLessonTo === sub.id}
            onAddLessonToggle={() => setAddingLessonTo(addingLessonTo === sub.id ? null : sub.id)}
            onLessonStatus={(lessonId, status) => {
              if (status !== 'completed' && !confirm(status === 'no_show' ? 'Отметить неявку? Урок спишется с баланса.' : 'Отменить урок?')) return
              lessonMutation.mutate({ subId: sub.id, lessonId, status })
            }}
            onLessonAdded={() => { setAddingLessonTo(null); invalidate() }}
            onCancelSubscription={() => {
              if (confirm(`Отменить абонемент «${sub.packageName}»?`)) cancelMutation.mutate(sub.id)
            }}
          />
        </div>
      ))}

      {history.length > 0 && (
        <div className="mt-1 space-y-1">
          {history.map(sub => (
            <div key={sub.id} className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-400 bg-white/60 border border-gray-100 rounded-lg">
              <span className="truncate">{sub.packageName} · {sub.lessonsUsed}/{sub.lessonsTotal} исп.</span>
              <span className="shrink-0 ml-2">{STATUS_LABELS[sub.effectiveStatus] ?? sub.effectiveStatus}</span>
            </div>
          ))}
        </div>
      )}

      {dealId && <PaymentsBlock dealId={dealId} />}

      {showInvoice && dealId && (
        <InvoiceDialog
          dealId={dealId}
          contactId={contactId}
          onClose={() => setShowInvoice(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['payments', 'deal', dealId] })
            queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
          }}
        />
      )}
    </div>
  )
}

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Ожидает оплаты', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  succeeded: { label: 'Оплачен', cls: 'bg-green-50 text-green-700 border-green-200' },
  failed: { label: 'Ошибка', cls: 'bg-red-50 text-red-600 border-red-200' },
  canceled: { label: 'Отменён', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const PROVIDER_SHORT: Record<string, string> = { cloudpayments: 'CP', robokassa: 'RK' }

function PaymentsBlock({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient()
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['payments', 'deal', dealId],
    queryFn: () => paymentsApi.list({ dealId }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments', 'deal', dealId] }),
  })

  if (payments.length === 0) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Счета</p>
      <div className="space-y-1">
        {payments.map(p => {
          const status = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.pending
          return (
            <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-white border border-gray-100 rounded-lg">
              <span className="text-gray-700 truncate">
                {p.packageName} · {formatMoney(Number(p.amount))}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400 shrink-0">{PROVIDER_SHORT[p.provider] ?? p.provider} №{p.invoiceId}</span>
              <span className={cn('ml-auto shrink-0 px-1.5 py-0.5 text-[10px] border rounded', status.cls)}>
                {status.label}
              </span>
              {p.status === 'pending' && (
                <span className="flex items-center gap-1 shrink-0">
                  {p.paymentUrl && (
                    <button
                      onClick={() => navigator.clipboard.writeText(p.paymentUrl!)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Копировать ссылку"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm('Отменить счёт?')) cancelMutation.mutate(p.id) }}
                    className="text-[10px] text-gray-400 hover:text-red-500"
                  >
                    Отменить
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LessonsBlock({
  sub,
  expanded,
  onToggle,
  addingLesson,
  onAddLessonToggle,
  onLessonStatus,
  onLessonAdded,
  onCancelSubscription,
}: {
  sub: Subscription
  expanded: boolean
  onToggle: () => void
  addingLesson: boolean
  onAddLessonToggle: () => void
  onLessonStatus: (lessonId: string, status: 'completed' | 'no_show' | 'canceled') => void
  onLessonAdded: () => void
  onCancelSubscription: () => void
}) {
  const lessons = sub.lessons ?? []

  return (
    <div className="mt-2 pt-2 border-t border-gray-50">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Уроки ({lessons.length})
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onAddLessonToggle} className="text-xs text-blue-600 hover:text-blue-700">
            + Урок
          </button>
          <button onClick={onCancelSubscription} className="text-xs text-gray-400 hover:text-red-500">
            Отменить абонемент
          </button>
        </div>
      </div>

      {addingLesson && <AddLessonForm subscriptionId={sub.id} onDone={onLessonAdded} />}

      {expanded && (
        <div className="mt-1.5 space-y-1">
          {lessons.length === 0 && <p className="text-xs text-gray-400">Уроков пока нет</p>}
          {lessons.map((lesson: Lesson) => (
            <div key={lesson.id} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-gray-50 rounded-md">
              <span className="text-gray-700">{formatDateTime(lesson.scheduledAt)}</span>
              {lesson.teacher && <span className="text-gray-400 truncate">· {lesson.teacher.name}</span>}
              <span className="ml-auto shrink-0">
                {lesson.status === 'scheduled' ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => onLessonStatus(lesson.id, 'completed')}
                      className="px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                    >
                      Проведён
                    </button>
                    <button
                      onClick={() => onLessonStatus(lesson.id, 'no_show')}
                      className="px-1.5 py-0.5 text-[10px] bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100"
                    >
                      Не пришёл
                    </button>
                    <button
                      onClick={() => onLessonStatus(lesson.id, 'canceled')}
                      className="px-1.5 py-0.5 text-[10px] text-gray-400 border border-gray-200 rounded hover:bg-gray-100"
                    >
                      Отмена
                    </button>
                  </span>
                ) : (
                  <span className={cn(
                    'text-[10px]',
                    lesson.status === 'completed' ? 'text-green-600' : lesson.status === 'no_show' ? 'text-orange-600' : 'text-gray-400'
                  )}>
                    {LESSON_STATUS_LABELS[lesson.status]}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddLessonForm({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() })
  const teachers = users.filter(u => u.isTeacher)
  // Пока учителей не завели — показываем всех с подписью роли
  const options = teachers.length > 0 ? teachers : users

  const mutation = useMutation({
    mutationFn: () =>
      subscriptionsApi.createLesson(subscriptionId, {
        scheduledAt: toISO(scheduledAt),
        teacherId: teacherId || undefined,
      }),
    onSuccess: onDone,
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string } } }
      setError(axErr.response?.data?.message ?? 'Ошибка')
    },
  })

  return (
    <div className="mt-1.5 p-2.5 bg-blue-50 border border-blue-100 rounded-md space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="datetime-local"
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
        />
        <select
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={teacherId}
          onChange={e => setTeacherId(e.target.value)}
        >
          <option value="">— преподаватель —</option>
          {options.map(u => (
            <option key={u.id} value={u.id}>
              {u.name}{teachers.length === 0 ? ` (${u.role})` : ''}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate()}
          disabled={!scheduledAt || mutation.isPending}
          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Добавить урок
        </button>
      </div>
    </div>
  )
}

function CreateSubscriptionForm({
  contactId,
  dealId,
  onDone,
  onCancel,
}: {
  contactId: string
  dealId?: string
  onDone: () => void
  onCancel: () => void
}) {
  const [packageId, setPackageId] = useState('')
  const [lessonsTotal, setLessonsTotal] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ['packages', 'active'],
    queryFn: () => packagesApi.list({ active: true }),
  })

  const selectPackage = (id: string) => {
    setPackageId(id)
    const pkg = packages.find(p => p.id === id)
    if (pkg) {
      // Префилл из пакета, поля остаются редактируемыми (ручная корректировка)
      setLessonsTotal(String(pkg.lessonsCount))
      setPrice(String(Number(pkg.price)))
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      subscriptionsApi.create({
        contactId,
        dealId,
        packageId,
        lessonsTotal: lessonsTotal ? Number(lessonsTotal) : undefined,
        price: price ? Number(price) : undefined,
      }),
    onSuccess: onDone,
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string; error?: string } } }
      setError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Ошибка')
    },
  })

  return (
    <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-md space-y-1.5 mb-2">
      <p className="text-[10px] text-gray-500">
        Ручное создание — для оплат наличными/переводом. Счёт со ссылкой выставляется кнопкой «Выставить счёт».
      </p>
      <select
        className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={packageId}
        onChange={e => selectPackage(e.target.value)}
      >
        <option value="">— выберите пакет —</option>
        {packages.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.lessonsCount} ур.{p.lessonDurationMinutes != null ? ` по ${p.lessonDurationMinutes} мин` : ''} · {formatMoney(Number(p.price))}
          </option>
        ))}
      </select>
      {packageId && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Уроков</label>
            <input
              type="number" min="1"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={lessonsTotal}
              onChange={e => setLessonsTotal(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Цена, ₽</label>
            <input
              type="number" min="0"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </div>
        </div>
      )}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">
          Отмена
        </button>
        <button
          onClick={() => mutation.mutate()}
          disabled={!packageId || mutation.isPending}
          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Создать абонемент
        </button>
      </div>
    </div>
  )
}
