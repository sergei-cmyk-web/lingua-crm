'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { CheckSquare, Download, Loader2, Trash2, X } from 'lucide-react'
import { dealsApi } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { DEMO_MODE } from '@/lib/demo/config'
import { useHasPermission } from '@/store/auth.store'
import type { Deal, Stage } from '@crm/shared'
import { KanbanColumn } from './KanbanColumn'
import { DealCard } from './DealCard'
import { CreateDealModal } from '../deal/CreateDealModal'
import LostReasonDialog from '../deal/LostReasonDialog'

function downloadBlob(blob: Blob, format: 'csv' | 'xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `сделки-${new Date().toISOString().slice(0, 10)}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

interface KanbanData {
  id: string
  name: string
  color: string
  order: number
  type: string
  deals: Deal[]
  totalDeals: number // всего сделок в этапе; deals — только загруженные (свежие 100)
}

interface Props {
  pipelineId: string
}

export function KanbanBoard({ pipelineId }: Props) {
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const canDelete = useHasPermission('trash.manage')
  const canExport = useHasPermission('deals.export')
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [createStageId, setCreateStageId] = useState<string | null>(null)
  const [localColumns, setLocalColumns] = useState<KanbanData[]>([])
  // Drop в lost-колонку: перенос отложен до выбора причины в диалоге
  const [pendingLostMove, setPendingLostMove] = useState<{ dealId: string; stageId: string } | null>(null)
  const [lostMovePending, setLostMovePending] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: columns, isLoading } = useQuery<KanbanData[]>({
    queryKey: ['kanban', pipelineId],
    queryFn: () => dealsApi.kanban(pipelineId),
  })

  useEffect(() => {
    if (columns) setLocalColumns(columns)
  }, [columns])

  // Socket.io real-time updates — не в demo-режиме (мутации не долетают до бэкенда,
  // реальных событий от «других» пользователей не будет, см. lib/demo/adapter.ts).
  useEffect(() => {
    if (DEMO_MODE) return
    const socket = getSocket()
    socket.connect()
    socket.emit('join:pipeline', pipelineId)

    const handleDealMoved = ({ deal, prevStageId, newStageId }: { deal: Deal; prevStageId: string; newStageId: string }) => {
      setLocalColumns(prev =>
        prev.map(col => {
          if (col.id === prevStageId) return { ...col, deals: col.deals.filter(d => d.id !== deal.id), totalDeals: Math.max(0, col.totalDeals - 1) }
          if (col.id === newStageId) return { ...col, deals: [deal, ...col.deals.filter(d => d.id !== deal.id)], totalDeals: col.totalDeals + 1 }
          return col
        })
      )
      // Refresh the open deal card so the Stage dropdown reflects the new value
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id] })
    }

    const handleDealCreated = (deal: Deal) => {
      setLocalColumns(prev =>
        prev.map(col => col.id === deal.stageId ? { ...col, deals: [deal, ...col.deals], totalDeals: col.totalDeals + 1 } : col)
      )
    }

    const handleDealUpdated = (deal: Deal) => {
      setLocalColumns(prev =>
        prev.map(col => ({
          ...col,
          deals: col.deals.map(d => d.id === deal.id ? deal : d),
        }))
      )
    }

    const handleDealDeleted = ({ id }: { id: string }) => {
      setLocalColumns(prev =>
        prev.map(col =>
          col.deals.some(d => d.id === id)
            ? { ...col, deals: col.deals.filter(d => d.id !== id), totalDeals: Math.max(0, col.totalDeals - 1) }
            : col
        )
      )
    }

    // Счётчик сообщений на карточке (DealCard) — иначе он обновляется только при перезагрузке доски
    const handleNewMessage = ({ dealId }: { dealId: string }) => {
      setLocalColumns(prev =>
        prev.map(col => ({
          ...col,
          deals: col.deals.map(d =>
            d.id === dealId
              ? { ...d, _count: { ...d._count, tasks: d._count?.tasks ?? 0, calls: d._count?.calls ?? 0, messages: (d._count?.messages ?? 0) + 1 } }
              : d
          ),
        }))
      )
    }

    socket.on('DEAL_MOVED', handleDealMoved)
    socket.on('DEAL_CREATED', handleDealCreated)
    socket.on('DEAL_UPDATED', handleDealUpdated)
    socket.on('DEAL_DELETED', handleDealDeleted)
    socket.on('NEW_MESSAGE', handleNewMessage)

    return () => {
      socket.emit('leave:pipeline', pipelineId)
      socket.off('DEAL_MOVED', handleDealMoved)
      socket.off('DEAL_CREATED', handleDealCreated)
      socket.off('DEAL_UPDATED', handleDealUpdated)
      socket.off('DEAL_DELETED', handleDealDeleted)
      socket.off('NEW_MESSAGE', handleNewMessage)
    }
  }, [pipelineId])

  const onSelectAllInStage = useCallback((dealIds: string[]) => {
    setSelected(prev => {
      const next = new Set(prev)
      const allSelected = dealIds.every(id => next.has(id))
      dealIds.forEach(id => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }, [])

  const onDealClick = useCallback((deal: Deal) => {
    if (selectionMode) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(deal.id)) next.delete(deal.id)
        else next.add(deal.id)
        return next
      })
      return
    }
    window.open(`/deals/${deal.id}`, '_blank', 'noopener,noreferrer')
  }, [selectionMode])

  const bulkDeleteMutation = useMutation({
    mutationFn: () => dealsApi.bulkDelete(Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      setSelected(new Set())
      setSelectionMode(false)
    },
  })

  const exportSelectedMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => dealsApi.exportDeals({ format, ids: Array.from(selected) }),
    onSuccess: downloadBlob,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    const deal = event.active.data.current?.deal as Deal
    if (deal) setActiveDeal(deal)
  }, [])

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeCol = localColumns.find(c => c.deals.some(d => d.id === activeId))
    const overCol = localColumns.find(c => c.id === overId || c.deals.some(d => d.id === overId))

    if (!activeCol || !overCol || activeCol.id === overCol.id) return

    setLocalColumns(prev => {
      const deal = activeCol.deals.find(d => d.id === activeId)!
      return prev.map(col => {
        if (col.id === activeCol.id) return { ...col, deals: col.deals.filter(d => d.id !== activeId) }
        if (col.id === overCol.id) return { ...col, deals: [deal, ...col.deals] }
        return col
      })
    })
  }, [localColumns])

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeal(null)
    if (!over) return

    const dealId = active.id as string
    const overId = over.id as string

    const targetCol = localColumns.find(c => c.id === overId || c.deals.some(d => d.id === overId))
    if (!targetCol) return

    // Lost-этап требует причину: карточка уже визуально в колонке (onDragOver),
    // реальный перенос выполнит подтверждение диалога, отмена откатит через invalidate
    if (targetCol.type === 'lost') {
      setPendingLostMove({ dealId, stageId: targetCol.id })
      return
    }

    try {
      await dealsApi.moveStage(dealId, { stageId: targetCol.id })
      // Refresh the deal card cache directly: don't rely on the DEAL_MOVED
      // socket event — if it's lost, opening the deal shows the old stage
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
    } catch {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
    }
  }, [localColumns, pipelineId, queryClient])

  const confirmLostMove = useCallback(async (lostReasonId: string, lostComment?: string) => {
    if (!pendingLostMove) return
    setLostMovePending(true)
    try {
      await dealsApi.moveStage(pendingLostMove.dealId, { stageId: pendingLostMove.stageId, lostReasonId, lostComment })
      queryClient.invalidateQueries({ queryKey: ['deal', pendingLostMove.dealId] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
    } finally {
      setLostMovePending(false)
      setPendingLostMove(null)
    }
  }, [pendingLostMove, pipelineId, queryClient])

  const cancelLostMove = useCallback(() => {
    setPendingLostMove(null)
    // Откат оптимистичного перемещения из onDragOver
    queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
  }, [pipelineId, queryClient])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Загрузка воронки...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {(canDelete || canExport) && (
        <div className="flex items-center justify-end px-6 pt-2 shrink-0">
          <button
            onClick={() => {
              setSelectionMode(v => !v)
              setSelected(new Set())
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded-md text-gray-600 hover:border-gray-300 bg-white"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectionMode ? 'Готово' : 'Выбрать'}
          </button>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div
          ref={scrollRef}
          onWheel={e => {
            // Мышь без трекпада: обычное вертикальное колесо крутит доску вбок.
            // Трекпад и шифт+колесо уже дают deltaX сами — им не мешаем.
            if (e.deltaY === 0 || e.deltaX !== 0) return
            e.currentTarget.scrollLeft += e.deltaY
          }}
          className="kanban-scroll flex gap-4 overflow-x-auto pb-4 px-6 flex-1 min-h-0 items-start pt-4"
        >
          {localColumns.map(col => (
            <KanbanColumn
              key={col.id}
              stage={col as unknown as Stage}
              deals={col.deals}
              totalDeals={col.totalDeals}
              pipelineId={pipelineId}
              onDealClick={onDealClick}
              onAddDeal={setCreateStageId}
              selectionMode={selectionMode}
              selectedIds={selected}
              onSelectAllInStage={onSelectAllInStage}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && (
            <DealCard deal={activeDeal} onClick={() => {}} />
          )}
        </DragOverlay>
      </DndContext>

      {selectionMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-lg">
          <button onClick={() => setSelected(new Set())} className="p-0.5 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-700">Выбрано: {selected.size}</span>
          {canExport && (
            <>
              <button
                onClick={() => exportSelectedMutation.mutate('csv')}
                disabled={exportSelectedMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50"
              >
                {exportSelectedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                CSV
              </button>
              <button
                onClick={() => exportSelectedMutation.mutate('xlsx')}
                disabled={exportSelectedMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50"
              >
                {exportSelectedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Excel
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirm(`Удалить ${selected.size} сделок(и)?`)) bulkDeleteMutation.mutate()
              }}
              disabled={bulkDeleteMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-red-200 rounded-md text-red-600 hover:border-red-300 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Удалить
            </button>
          )}
        </div>
      )}

      {pendingLostMove && (
        <LostReasonDialog
          onConfirm={confirmLostMove}
          onCancel={cancelLostMove}
          isPending={lostMovePending}
        />
      )}

      {createStageId && (
        <CreateDealModal
          pipelineId={pipelineId}
          stageId={createStageId}
          onClose={() => setCreateStageId(null)}
          onCreated={(deal) => {
            setLocalColumns(prev =>
              prev.map(col => col.id === deal.stageId ? { ...col, deals: [deal, ...col.deals], totalDeals: col.totalDeals + 1 } : col)
            )
            setCreateStageId(null)
          }}
        />
      )}
    </div>
  )
}
