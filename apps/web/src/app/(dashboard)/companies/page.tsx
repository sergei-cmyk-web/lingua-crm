'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Building2, Users, LayoutDashboard, X, Trash2, Merge } from 'lucide-react'
import { companiesApi } from '@/lib/api'
import type { Company } from '@crm/shared'
import { useHasPermission } from '@/store/auth.store'

function CompanyDuplicateGroupCard({ group }: { group: Company[] }) {
  const queryClient = useQueryClient()
  const [strategy, setStrategy] = useState<'newest' | 'oldest'>('newest')
  const [selected, setSelected] = useState<Set<string>>(new Set(group.map(c => c.id)))

  const mergeMutation = useMutation({
    mutationFn: () => companiesApi.merge(Array.from(selected), strategy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (mergeMutation.isSuccess) return null

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="space-y-1.5">
        {group.map(c => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-gray-300 shrink-0" />
            <span className="font-medium text-gray-900">{c.name}</span>
            <span className="text-gray-400 text-xs flex items-center gap-1 shrink-0"><Users className="h-3 w-3" />{c._count?.contacts ?? 0}</span>
            <span className="text-gray-400 text-xs flex items-center gap-1 shrink-0"><LayoutDashboard className="h-3 w-3" />{c._count?.deals ?? 0}</span>
            <span className="text-gray-300 text-xs ml-auto shrink-0">{new Date(c.createdAt).toLocaleDateString('ru-RU')}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value as 'newest' | 'oldest')}
          className="text-xs border border-gray-200 rounded-md px-2 py-1"
        >
          <option value="newest">При конфликте: новая по дате создания</option>
          <option value="oldest">При конфликте: старая по дате создания</option>
        </select>
        <button
          onClick={() => mergeMutation.mutate()}
          disabled={selected.size < 2 || mergeMutation.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          <Merge className="h-3.5 w-3.5" />
          Объединить ({selected.size})
        </button>
      </div>
      {mergeMutation.isError && <p className="text-xs text-red-500">Не удалось объединить</p>}
    </div>
  )
}

function CompanyDuplicatesDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['companies', 'duplicates'], queryFn: () => companiesApi.duplicates() })
  const groups: Company[][] = data?.groups ?? []

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Дубли компаний</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Точное совпадение названия без учёта регистра. Отметьте, кого объединять — остальные уйдут в корзину.</p>
        <div className="flex-1 overflow-y-auto space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-400">Поиск дублей...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Дублей не найдено</p>
          ) : (
            groups.map(group => <CompanyDuplicateGroupCard key={group.map(c => c.id).join(',')} group={group} />)
          )}
        </div>
      </div>
    </div>
  )
}

function CreateCompanyModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [duplicates, setDuplicates] = useState<Company[] | null>(null)

  const createMutation = useMutation({
    mutationFn: (force?: boolean) => companiesApi.create({ name: name.trim(), force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      onClose()
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { status: number; data?: { error: string; matches?: Company[] } } }
      if (axErr.response?.status === 409 && axErr.response.data?.error === 'duplicate_company') {
        setDuplicates(axErr.response.data.matches ?? [])
      }
    },
  })

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Новая компания</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        {duplicates && duplicates.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Компания с таким названием уже есть
            </p>
            <div className="space-y-1.5">
              {duplicates.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-md text-sm">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <button onClick={() => router.push(`/companies/${c.id}`)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 shrink-0">
                    Открыть
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
              <button
                onClick={() => createMutation.mutate(true)}
                disabled={createMutation.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Всё равно создать
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (name.trim()) createMutation.mutate(false) }} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Название <span className="text-red-500">*</span></label>
              <input autoFocus required className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="ООО Ромашка" value={name} onChange={e => setName(e.target.value)} />
            </div>
            {createMutation.isError && <p className="text-sm text-red-500">Ошибка при создании компании</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
              <button type="submit" disabled={!name.trim() || createMutation.isPending} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function CompaniesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const canDelete = useHasPermission('trash.manage')

  const { data, isLoading } = useQuery({
    queryKey: ['companies', search],
    queryFn: () => companiesApi.list({ search, limit: 100 }),
  })

  const companies: Company[] = data?.companies ?? []
  const allSelected = companies.length > 0 && companies.every(c => selected.has(c.id))

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(companies.map(c => c.id)))

  const bulkDeleteMutation = useMutation({
    mutationFn: () => companiesApi.bulkDelete(Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setSelected(new Set())
    },
  })

  return (
    <div className="flex flex-col h-full">
      {showCreate && <CreateCompanyModal onClose={() => setShowCreate(false)} />}
      {showDuplicates && <CompanyDuplicatesDialog onClose={() => setShowDuplicates(false)} />}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Компании</h1>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={() => setShowDuplicates(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors">
              <Merge className="h-3.5 w-3.5" />
              Найти дубли
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </button>
        </div>
      </div>

      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {canDelete && companies.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300" />
            Выбрать все
          </label>
        )}
      </div>

      {selected.size > 0 && canDelete && (
        <div className="flex items-center gap-3 px-6 py-2 bg-blue-50 border-b border-blue-100">
          <button onClick={() => setSelected(new Set())} className="p-0.5 text-blue-700 hover:text-blue-900">
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm text-blue-800">Выбрано: {selected.size}</span>
          <button
            onClick={() => {
              if (confirm(`Удалить ${selected.size} компани(й)?`)) bulkDeleteMutation.mutate()
            }}
            disabled={bulkDeleteMutation.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-red-200 rounded-md text-red-600 bg-white hover:border-red-300 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Загрузка...</p>
        ) : (
          <div className="space-y-1">
            {companies.map((company: Company) => (
              <div key={company.id} onClick={() => router.push(`/companies/${company.id}`)} className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors">
                {canDelete && (
                  <input
                    type="checkbox"
                    checked={selected.has(company.id)}
                    onChange={() => toggleOne(company.id)}
                    onClick={e => e.stopPropagation()}
                    className="rounded border-gray-300 shrink-0"
                  />
                )}
                <div className="h-8 w-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{company.name}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {(company as Company & { _count?: { contacts: number } })._count?.contacts ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutDashboard className="h-3 w-3" />
                    {(company as Company & { _count?: { deals: number } })._count?.deals ?? 0}
                  </span>
                </div>
              </div>
            ))}
            {companies.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">Компании не найдены</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
