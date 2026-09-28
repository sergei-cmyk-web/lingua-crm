'use client'

import Link from 'next/link'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useHasPermission } from '@/store/auth.store'
import type { Deal, Stage } from '@crm/shared'
import { DealCard } from './DealCard'
import { formatMoney } from '@/lib/utils'

interface Props {
  stage: Stage
  deals: Deal[]
  totalDeals?: number
  pipelineId?: string
  onDealClick: (deal: Deal) => void
  onAddDeal: (stageId: string) => void
  selectionMode?: boolean
  selectedIds?: Set<string>
  onSelectAllInStage?: (dealIds: string[]) => void
}

export function KanbanColumn({ stage, deals, totalDeals, pipelineId, onDealClick, onAddDeal, selectionMode, selectedIds, onSelectAllInStage }: Props) {
  const canAddDeal = useHasPermission('entities.edit')
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: 'column', stage } })

  const totalBudget = deals.reduce((sum, d) => sum + Number(d.budget ?? 0), 0)
  const allSelected = deals.length > 0 && deals.every(d => selectedIds?.has(d.id))
  const total = totalDeals ?? deals.length
  const hasMore = total > deals.length

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        {selectionMode && deals.length > 0 && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onSelectAllInStage?.(deals.map(d => d.id))}
            className="rounded border-gray-300 shrink-0"
            title="Выбрать все сделки этапа"
          />
        )}
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{stage.name}</span>
        <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{total}</span>
      </div>

      {totalBudget > 0 && (
        <div className="px-2 mb-2">
          <span className="text-xs text-gray-500">{formatMoney(totalBudget)}</span>
        </div>
      )}

      {/* Add deal button */}
      {canAddDeal && (
      <button
        onClick={() => onAddDeal(stage.id)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 mb-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Добавить сделку
      </button>
      )}

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-lg p-2 space-y-2 min-h-24 transition-colors ${
          isOver ? 'bg-blue-50 border-2 border-blue-200 border-dashed' : 'bg-gray-100/50'
        }`}
      >
        <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map(deal => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={onDealClick}
              selectionMode={selectionMode}
              selected={selectedIds?.has(deal.id)}
            />
          ))}
        </SortableContext>
        {hasMore && (
          <Link
            href={`/deals?pipelineId=${pipelineId ?? ''}&stageId=${stage.id}`}
            className="block text-center text-xs text-blue-600 hover:text-blue-700 py-2"
          >
            Ещё {total - deals.length} → в списке
          </Link>
        )}
      </div>
    </div>
  )
}
