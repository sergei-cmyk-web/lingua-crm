'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { lostReasonsApi } from '@/lib/api'
import type { LostReason } from '@crm/shared'

interface LostReasonDialogProps {
  onConfirm: (lostReasonId: string, lostComment?: string) => void
  onCancel: () => void
  isPending?: boolean
}

// Общий диалог для канбана (drop в lost-колонку) и DealModal (смена этапа на lost)
export default function LostReasonDialog({ onConfirm, onCancel, isPending }: LostReasonDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const { data: reasons = [], isLoading } = useQuery<LostReason[]>({
    queryKey: ['lostReasons', 'active'],
    queryFn: () => lostReasonsApi.list({ active: true }),
  })

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
      onClick={e => { e.stopPropagation(); onCancel() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Почему сделка потеряна?</h3>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Загрузка…</p>
        ) : reasons.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            Причины потери не настроены. Добавьте их в «Настройки → Воронка».
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {reasons.map(r => (
              <label
                key={r.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                  selectedId === r.id
                    ? 'border-red-300 bg-red-50 text-red-800'
                    : 'border-gray-100 hover:border-gray-200 text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="lostReason"
                  checked={selectedId === r.id}
                  onChange={() => setSelectedId(r.id)}
                  className="accent-red-500"
                />
                {r.name}
              </label>
            ))}
          </div>
        )}

        <textarea
          className="mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          rows={2}
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Отмена
          </button>
          <button
            onClick={() => { if (selectedId) onConfirm(selectedId, comment.trim() || undefined) }}
            disabled={!selectedId || isPending}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Сохранение…' : 'Сделка потеряна'}
          </button>
        </div>
      </div>
    </div>
  )
}
