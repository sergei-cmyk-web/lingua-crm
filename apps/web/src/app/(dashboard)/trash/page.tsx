'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { trashApi, type TrashEntityType } from '@/lib/api'
import { formatDateTime, formatMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

const DAY_MS = 24 * 60 * 60 * 1000

function daysLeft(deletedAt: string, retentionDays: number) {
  const left = Math.ceil((new Date(deletedAt).getTime() + retentionDays * DAY_MS - Date.now()) / DAY_MS)
  return Math.max(left, 0)
}

export default function TrashPage() {
  const isAdmin = useAuthStore(s => s.user?.permissions?.includes('trash.manage') ?? false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: trashApi.list,
    enabled: isAdmin,
  })

  const restoreMutation = useMutation({
    mutationFn: ({ type, id }: { type: TrashEntityType; id: string }) => trashApi.restore(type, id),
    onSuccess: (_data, { type }) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      if (type === 'deals') {
        queryClient.invalidateQueries({ queryKey: ['deals'] })
        queryClient.invalidateQueries({ queryKey: ['kanban'] })
      } else if (type === 'contacts') {
        queryClient.invalidateQueries({ queryKey: ['contacts'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['companies'] })
      }
    },
  })

  const deleteForeverMutation = useMutation({
    mutationFn: ({ type, id }: { type: TrashEntityType; id: string }) => trashApi.deleteForever(type, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trash'] }),
  })

  if (!isAdmin) {
    return <div className="p-8 text-sm text-gray-500">Корзина доступна только администраторам.</div>
  }
  if (isLoading || !data) {
    return <div className="p-8 text-sm text-gray-400">Загрузка...</div>
  }

  const { deals, contacts, companies, retentionDays } = data
  const isEmpty = deals.length === 0 && contacts.length === 0 && companies.length === 0
  const pending = restoreMutation.isPending || deleteForeverMutation.isPending

  const actions = (type: TrashEntityType, id: string, name: string) => (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => restoreMutation.mutate({ type, id })}
        disabled={pending}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        Восстановить
      </button>
      <button
        onClick={() => {
          if (confirm(`Удалить «${name}» навсегда? Это действие необратимо.`)) {
            deleteForeverMutation.mutate({ type, id })
          }
        }}
        disabled={pending}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-3 w-3" />
        Навсегда
      </button>
    </div>
  )

  const meta = (deletedAt: string) => (
    <p className="text-xs text-gray-400">
      Удалено {formatDateTime(deletedAt)} · сотрётся через {daysLeft(deletedAt, retentionDays)} дн.
    </p>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Корзина</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Удалённые записи хранятся {retentionDays} дней, затем стираются навсегда автоматически.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">
          {isEmpty && <p className="text-sm text-gray-400">Корзина пуста.</p>}

          {deals.length > 0 && (
            <section className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Сделки ({deals.length})
              </h2>
              <div className="divide-y divide-gray-50">
                {deals.map(d => (
                  <div key={d.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-900 truncate">{d.title}</p>
                        {d.stage && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: d.stage.color }}>
                            {d.stage.name}
                          </span>
                        )}
                        {d.budget != null && (
                          <span className="text-xs text-gray-500 shrink-0">{formatMoney(Number(d.budget))}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {d.pipeline?.name}
                        {d.contact && <> · {d.contact.name}</>}
                      </p>
                      {meta(d.deletedAt)}
                    </div>
                    {actions('deals', d.id, d.title)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {contacts.length > 0 && (
            <section className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Контакты ({contacts.length})
              </h2>
              <div className="divide-y divide-gray-50">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                        {c._count.deals > 0 && <> · сделок: {c._count.deals}</>}
                      </p>
                      {meta(c.deletedAt)}
                    </div>
                    {actions('contacts', c.id, c.name)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {companies.length > 0 && (
            <section className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Компании ({companies.length})
              </h2>
              <div className="divide-y divide-gray-50">
                {companies.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        Контактов: {c._count.contacts} · сделок: {c._count.deals}
                      </p>
                      {meta(c.deletedAt)}
                    </div>
                    {actions('companies', c.id, c.name)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isEmpty && (
            <p className="text-xs text-gray-400">
              Восстановленные сделки возвращаются в свой этап <Link href="/" className="text-blue-600 hover:underline">воронки</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
