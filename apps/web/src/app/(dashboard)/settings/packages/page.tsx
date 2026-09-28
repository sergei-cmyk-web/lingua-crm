'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { packagesApi } from '@/lib/api'
import { cn, formatMoney } from '@/lib/utils'
import type { Package } from '@crm/shared'

interface PackageFormState {
  name: string
  lessonsCount: string
  lessonDurationMinutes: string
  durationDays: string
  price: string
}

const emptyForm: PackageFormState = { name: '', lessonsCount: '', lessonDurationMinutes: '', durationDays: '', price: '' }

function PackageForm({
  initial = emptyForm,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: PackageFormState
  onSave: (data: { name: string; lessonsCount: number; lessonDurationMinutes: number | null; durationDays: number | null; price: number }) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [form, setForm] = useState<PackageFormState>(initial)
  const valid = form.name.trim() && Number(form.lessonsCount) > 0 && Number(form.price) >= 0

  const submit = () => {
    if (!valid) return
    onSave({
      name: form.name.trim(),
      lessonsCount: Number(form.lessonsCount),
      lessonDurationMinutes: form.lessonDurationMinutes ? Number(form.lessonDurationMinutes) : null,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
      price: Number(form.price),
    })
  }

  return (
    <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
      <input
        autoFocus
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        placeholder="Название (напр. «8 уроков английского»)"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
      />
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Уроков</label>
          <input
            type="number" min="1"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={form.lessonsCount}
            onChange={e => setForm(f => ({ ...f, lessonsCount: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Урок, мин</label>
          <input
            type="number" min="1"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="60"
            value={form.lessonDurationMinutes}
            onChange={e => setForm(f => ({ ...f, lessonDurationMinutes: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Срок, дней (пусто = бессрочно)</label>
          <input
            type="number" min="1"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={form.durationDays}
            onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Цена, ₽</label>
          <input
            type="number" min="0"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
        <button onClick={submit} disabled={!valid || isPending} className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50">
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function PackagesSettingsPage() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ['packages'],
    queryFn: () => packagesApi.list(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['packages'] })

  const createMutation = useMutation({
    mutationFn: packagesApi.create,
    onSuccess: () => { invalidate(); setShowAdd(false) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof packagesApi.update>[1]) =>
      packagesApi.update(id, data),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: packagesApi.delete,
    onSuccess: invalidate,
    onError: () => alert('По пакету уже есть абонементы — деактивируйте его вместо удаления'),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Абонементы (пакеты уроков)</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Тарифы для выставления счетов. При выставлении менеджер может скорректировать цену и число уроков.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => { setShowAdd(true); setEditingId(null) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить пакет
            </button>
          </div>

          <div className="space-y-1.5">
            {packages.map(pkg =>
              editingId === pkg.id ? (
                <PackageForm
                  key={pkg.id}
                  initial={{
                    name: pkg.name,
                    lessonsCount: String(pkg.lessonsCount),
                    lessonDurationMinutes: pkg.lessonDurationMinutes != null ? String(pkg.lessonDurationMinutes) : '',
                    durationDays: pkg.durationDays != null ? String(pkg.durationDays) : '',
                    price: String(Number(pkg.price)),
                  }}
                  isPending={updateMutation.isPending}
                  onSave={data => updateMutation.mutate({ id: pkg.id, ...data })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div
                  key={pkg.id}
                  className={cn(
                    'flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group hover:border-gray-200',
                    !pkg.active && 'opacity-50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{pkg.name}</p>
                    <p className="text-xs text-gray-400">
                      {pkg.lessonsCount} ур.
                      {pkg.lessonDurationMinutes != null && ` по ${pkg.lessonDurationMinutes} мин`}
                      {' · '}{pkg.durationDays != null ? `${pkg.durationDays} дн.` : 'бессрочно'}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-700 shrink-0">{formatMoney(Number(pkg.price))}</span>
                  {!pkg.active && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 shrink-0">Скрыт</span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => { setEditingId(pkg.id); setShowAdd(false) }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: pkg.id, active: !pkg.active })}
                      className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded"
                    >
                      {pkg.active ? 'Скрыть' : 'Вернуть'}
                    </button>
                    <button
                      onClick={() => {
                        if ((pkg._count?.subscriptions ?? 0) > 0) {
                          alert('По пакету уже есть абонементы — деактивируйте его вместо удаления')
                          return
                        }
                        if (confirm(`Удалить пакет «${pkg.name}»?`)) deleteMutation.mutate(pkg.id)
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {showAdd && (
            <div className="mt-1.5">
              <PackageForm
                isPending={createMutation.isPending}
                onSave={data => createMutation.mutate(data)}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {packages.length === 0 && !showAdd && (
            <p className="text-sm text-gray-400 text-center py-8">
              Нет пакетов. Добавьте первый — например «8 уроков / 30 дней / 8 000 ₽».
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
