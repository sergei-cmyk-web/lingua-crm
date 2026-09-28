'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, User, Building2, Download, Loader2, Trash2, X } from 'lucide-react'
import { dealsApi } from '@/lib/api'
import type { Deal } from '@crm/shared'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { useHasPermission } from '@/store/auth.store'
import { TagInput } from '@/components/entity/TagInput'

function downloadBlob(blob: Blob, format: 'csv' | 'xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `сделки-${new Date().toISOString().slice(0, 10)}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DealsPage() {
  const params = useSearchParams()
  // Приходят из overflow-ссылки канбана «Ещё N → в списке»
  const pipelineId = params.get('pipelineId') || undefined
  const stageId = params.get('stageId') || undefined
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Растёт по «Показать ещё»; сервер клампит limit до 200 (parsePagination) — предел плоского списка
  const [limit, setLimit] = useState(100)
  const canExport = useHasPermission('deals.export')
  const canDelete = useHasPermission('trash.manage')
  const queryClient = useQueryClient()

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['deals', 'tags'],
    queryFn: () => dealsApi.tags(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['deals', search, tags, pipelineId, stageId, limit],
    queryFn: () => dealsApi.list({
      search,
      limit,
      ...(pipelineId ? { pipelineId } : {}),
      ...(stageId ? { stageId } : {}),
      ...(tags.length ? { tags: tags.join(',') } : {}),
    }),
  })

  const deals: Deal[] = data?.deals ?? []
  const total: number = data?.total ?? deals.length
  const allSelected = deals.length > 0 && deals.every(d => selected.has(d.id))

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(deals.map(d => d.id)))

  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => dealsApi.exportDeals({ format, search, pipelineId, stageId }),
    onSuccess: downloadBlob,
  })

  const exportSelectedMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => dealsApi.exportDeals({ format, ids: Array.from(selected) }),
    onSuccess: downloadBlob,
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => dealsApi.bulkDelete(Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      setSelected(new Set())
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Сделки</h1>
        {canExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportMutation.mutate('csv')}
              disabled={exportMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50"
            >
              {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Экспорт CSV
            </button>
            <button
              onClick={() => exportMutation.mutate('xlsx')}
              disabled={exportMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50"
            >
              {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Экспорт Excel
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="max-w-sm w-full">
          <TagInput value={tags} onChange={setTags} suggestions={tagOptions} placeholder="Фильтр по тегам..." />
        </div>
      </div>

      {selected.size > 0 && (canDelete || canExport) && (
        <div className="flex items-center gap-3 px-6 py-2 bg-blue-50 border-b border-blue-100">
          <button onClick={() => setSelected(new Set())} className="p-0.5 text-blue-700 hover:text-blue-900">
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm text-blue-800">Выбрано: {selected.size}</span>
          <div className="flex items-center gap-2 ml-auto">
            {canExport && (
              <>
                <button
                  onClick={() => exportSelectedMutation.mutate('csv')}
                  disabled={exportSelectedMutation.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-blue-200 rounded-md text-blue-700 bg-white hover:border-blue-300 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Экспорт выбранных CSV
                </button>
                <button
                  onClick={() => exportSelectedMutation.mutate('xlsx')}
                  disabled={exportSelectedMutation.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-blue-200 rounded-md text-blue-700 bg-white hover:border-blue-300 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Экспорт выбранных Excel
                </button>
              </>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (confirm(`Удалить ${selected.size} сделок(и)?`)) bulkDeleteMutation.mutate()
                }}
                disabled={bulkDeleteMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-red-200 rounded-md text-red-600 bg-white hover:border-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-gray-400 p-6">Загрузка...</p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {canDelete && (
                  <th className="w-10 px-4 py-2.5 border-b border-gray-100">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300" />
                  </th>
                )}
                {['Название', 'Контакт', 'Этап', 'Ответственный', 'Сумма', 'Дата'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 border-b border-gray-100">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal: Deal) => (
                <tr
                  key={deal.id}
                  onClick={() => window.open(`/deals/${deal.id}`, '_blank', 'noopener,noreferrer')}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {canDelete && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(deal.id)}
                        onChange={() => toggleOne(deal.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{deal.title}</p>
                    {deal.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {deal.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] leading-none bg-blue-50 text-blue-700 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {deal.contact ? (
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <User className="h-3 w-3 text-gray-400" />
                        {deal.contact.name}
                      </span>
                    ) : deal.company ? (
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {deal.company.name}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {deal.stage && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: deal.stage.color }}
                      >
                        {deal.stage.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{deal.assignee?.name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">
                      {deal.budget ? formatMoney(Number(deal.budget)) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">{formatDateTime(deal.createdAt)}</span>
                  </td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 7 : 6} className="text-center py-12 text-sm text-gray-400">
                    Сделки не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!isLoading && total > deals.length && (
          <div className="text-center py-4">
            {deals.length >= 200 ? (
              <span className="text-xs text-gray-400">Показаны первые 200 из {total} — уточните поиск или фильтр</span>
            ) : (
              <button
                onClick={() => setLimit(l => Math.min(l + 100, 200))}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Показать ещё ({total - deals.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
