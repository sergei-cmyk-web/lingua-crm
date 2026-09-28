'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { dealsApi, contactsApi } from '@/lib/api'
import type { Deal } from '@crm/shared'

interface Props {
  pipelineId: string
  stageId: string
  onClose: () => void
  onCreated: (deal: Deal) => void
}

export function CreateDealModal({ pipelineId, stageId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactSearch, setContactSearch] = useState('')

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', contactSearch],
    queryFn: () => contactsApi.list({ search: contactSearch, limit: 20 }),
    enabled: contactSearch.length >= 2,
  })
  const contacts = contactsData?.contacts ?? []

  const createMutation = useMutation({
    mutationFn: () => dealsApi.create({
      title: title.trim(),
      pipelineId,
      stageId,
      budget: budget ? Number(budget) : undefined,
      contactId: contactId || undefined,
    }),
    onSuccess: (deal) => {
      onCreated(deal)
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createMutation.mutate()
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Новая сделка</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              required
              className={inputClass}
              placeholder="Иван Иванов — Английский B1"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Бюджет, ₽</label>
            <input
              type="number"
              min="0"
              className={inputClass}
              placeholder="15000"
              value={budget}
              onChange={e => setBudget(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Контакт</label>
            <input
              className={inputClass}
              placeholder="Начните вводить имя или телефон..."
              value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); setContactId('') }}
            />
            {contacts.length > 0 && !contactId && (
              <div className="mt-1 border border-gray-200 rounded-md bg-white shadow-sm overflow-hidden max-h-36 overflow-y-auto">
                {contacts.map((c: { id: string; name: string; phone?: string | null }) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
                    onClick={() => { setContactId(c.id); setContactSearch(c.name) }}
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {c.phone && <span className="text-gray-400">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {contactId && (
              <p className="mt-1 text-xs text-green-600">Контакт выбран</p>
            )}
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-500">Ошибка при создании сделки</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createMutation.isPending}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Создание...' : 'Создать сделку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
