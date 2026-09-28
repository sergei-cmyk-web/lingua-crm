'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users, LayoutDashboard, Save, Pencil, Trash2 } from 'lucide-react'
import { companiesApi } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore(s => s.user?.permissions?.includes('trash.manage') ?? false)
  const canEdit = useAuthStore(s => s.user?.permissions?.includes('entities.edit') ?? false)

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: () => companiesApi.get(id),
  })

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (company) setName(company.name ?? '')
  }, [company])

  const updateMutation = useMutation({
    mutationFn: () => companiesApi.update(id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] })
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setEditing(false)
    },
  })

  // Мягкое удаление в корзину (только админ); контакты и сделки компании остаются
  const deleteMutation = useMutation({
    mutationFn: () => companiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      router.push('/companies')
    },
  })

  if (isLoading) return <div className="p-8 text-gray-400 text-sm">Загрузка...</div>
  if (!company) return <div className="p-8 text-gray-400 text-sm">Компания не найдена</div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
        <button onClick={() => router.push('/companies')} className="p-1 rounded hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1">{company.name}</h1>
        {!editing ? (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm(`Удалить компанию «${company.name}»? Она попадёт в корзину и будет храниться там 30 дней. Контакты и сделки останутся.`)) {
                    deleteMutation.mutate()
                  }
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            )}
            {canEdit && <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </button>}
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!name.trim() || updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Main info */}
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Основная информация</h2>
            {editing ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Название *</label>
                <input
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && name.trim()) updateMutation.mutate() }}
                />
                {updateMutation.isError && <p className="mt-2 text-sm text-red-500">Ошибка при сохранении</p>}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{company.name}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {company.contacts?.length ?? 0} контактов</span>
                    <span className="flex items-center gap-1"><LayoutDashboard className="h-3 w-3" /> {company.deals?.length ?? 0} сделок</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contacts */}
          {company.contacts?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Контакты ({company.contacts.length})</h2>
              <div className="space-y-2">
                {company.contacts.map((c: { id: string; name: string; phone?: string | null; email?: string | null }) => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/contacts/${c.id}`)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer"
                  >
                    <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deals */}
          {company.deals?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Сделки ({company.deals.length})</h2>
              <div className="space-y-2">
                {company.deals.map((deal: { id: string; title: string; stage?: { name: string; color: string }; createdAt: string }) => (
                  <div key={deal.id} className={cn('flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200')}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(deal.createdAt)}</p>
                    </div>
                    {deal.stage && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: deal.stage.color }}>
                        {deal.stage.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
