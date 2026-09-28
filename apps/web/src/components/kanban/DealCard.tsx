'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageSquare, Phone, CheckSquare, User } from 'lucide-react'
import type { Deal } from '@crm/shared'
import { cn, formatMoney, formatDate } from '@/lib/utils'
import { useHasPermission } from '@/store/auth.store'

interface Props {
  deal: Deal
  onClick: (deal: Deal) => void
  selectionMode?: boolean
  selected?: boolean
}

export function DealCard({ deal, onClick, selectionMode, selected }: Props) {
  const canEdit = useHasPermission('entities.edit')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { type: 'deal', deal },
    disabled: !canEdit || selectionMode,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const nextTask = deal.tasks?.find(t => !t.completed)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(deal)}
      className={cn(
        'relative bg-white rounded-lg border border-gray-200 p-3 cursor-pointer',
        'hover:border-blue-300 hover:shadow-sm transition-all',
        'select-none touch-none',
        isDragging && 'opacity-40 shadow-lg rotate-2 z-50',
        selectionMode && selected && 'border-blue-400 ring-1 ring-blue-300'
      )}
    >
      {selectionMode && (
        <input
          type="checkbox"
          readOnly
          checked={Boolean(selected)}
          className="absolute top-2 right-2 rounded border-gray-300"
        />
      )}
      <p className="text-sm font-medium text-gray-900 leading-snug mb-2 line-clamp-2 pr-5">
        {deal.title}
      </p>

      {deal.contact && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{deal.contact.name}</span>
        </div>
      )}

      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {deal.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] leading-none bg-blue-50 text-blue-700 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {nextTask && (
        <div className="flex items-center gap-1.5 text-xs text-orange-600 mb-1.5">
          <CheckSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">{nextTask.title}</span>
          {nextTask.dueDate && (
            <span className="ml-auto shrink-0">{formatDate(nextTask.dueDate)}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {(deal._count?.messages ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <MessageSquare className="h-3 w-3" />
              {deal._count?.messages}
            </span>
          )}
          {(deal._count?.calls ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <Phone className="h-3 w-3" />
              {deal._count?.calls}
            </span>
          )}
        </div>

        {deal.budget && (
          <span className="text-xs font-semibold text-gray-700">
            {formatMoney(Number(deal.budget))}
          </span>
        )}
      </div>
    </div>
  )
}
