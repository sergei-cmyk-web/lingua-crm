'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, GripVertical, Check, X, ChevronRight } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { pipelinesApi, stagesApi, pipelineDeleteApi, lostReasonsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Pipeline, Stage, StageType, LostReason } from '@crm/shared'

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

const STAGE_TYPES: Array<{ value: StageType; label: string }> = [
  { value: 'open', label: 'Обычный' },
  { value: 'won', label: 'Успешно' },
  { value: 'lost', label: 'Потеряно' },
]

// --- Stage components ---

interface SortableStageProps {
  stage: Stage
  onEdit: (s: Stage) => void
  onDelete: (s: Stage) => void
}

function SortableStage({ stage, onEdit, onDelete }: SortableStageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group hover:border-gray-200"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4 text-gray-300" />
      </button>
      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
      <p className="flex-1 text-sm text-gray-900">{stage.name}</p>
      {stage.type === 'won' && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700 shrink-0">Успешно</span>
      )}
      {stage.type === 'lost' && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700 shrink-0">Потеряно</span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(stage)} className="p-1 text-gray-400 hover:text-gray-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(stage)} className="p-1 text-gray-400 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

interface StageFormProps {
  initialName?: string
  initialColor?: string
  initialType?: StageType
  onSave: (name: string, color: string, type: StageType) => void
  onCancel: () => void
  isPending?: boolean
}

function StageForm({ initialName = '', initialColor = '#6366f1', initialType = 'open', onSave, onCancel, isPending }: StageFormProps) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [type, setType] = useState<StageType>(initialType)

  return (
    <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
      <input
        autoFocus
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        placeholder="Название этапа"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color, type) }}
      />
      <div className="flex items-center gap-1.5">
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform"
            style={{
              backgroundColor: c,
              borderColor: color === c ? '#1d4ed8' : 'transparent',
              transform: color === c ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {STAGE_TYPES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              'px-2 py-1 text-xs rounded-md border transition-colors',
              type === t.value
                ? t.value === 'won'
                  ? 'bg-green-100 border-green-300 text-green-700'
                  : t.value === 'lost'
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-white border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
        <button
          onClick={() => { if (name.trim()) onSave(name.trim(), color, type) }}
          disabled={!name.trim() || isPending}
          className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// --- Delete stage dialog: выбор целевого этапа для переноса сделок ---

interface DeleteStageDialogProps {
  stage: Stage
  otherStages: Stage[]
  onConfirm: (targetStageId?: string) => void
  onCancel: () => void
  isPending?: boolean
}

function DeleteStageDialog({ stage, otherStages, onConfirm, onCancel, isPending }: DeleteStageDialogProps) {
  const [targetStageId, setTargetStageId] = useState('')

  const { data: check } = useQuery({
    queryKey: ['stage-deletion-check', stage.id, targetStageId],
    queryFn: () => stagesApi.deletionCheck(stage.id, targetStageId || undefined),
  })

  const dealCount = check?.dealCount ?? 0
  const totalCount = check?.totalCount ?? 0
  const requiredFields = (check?.requiredFields ?? []).filter(f => f.missingCount > 0)
  // totalCount, а не dealCount — сделки из корзины тоже ссылаются на этап и без переноса
  // на другой этап DELETE упадёт 409 (FK), даже если активных сделок 0.
  const needsTarget = totalCount > 0
  const blocked = needsTarget && otherStages.length === 0
  const canConfirm = check !== undefined && (!needsTarget || (Boolean(targetStageId) && !blocked))

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Удалить этап «{stage.name}»?</h2>

        {check === undefined ? (
          <p className="text-xs text-gray-400 mt-3">Проверка сделок...</p>
        ) : blocked ? (
          <p className="text-sm text-red-600 mt-3">
            В этапе {dealCount} сделок(и){dealCount < totalCount ? ` (и ${totalCount - dealCount} в корзине)` : ''}, а других этапов
            в воронке нет. Сначала создайте другой этап, чтобы было куда их перенести.
          </p>
        ) : needsTarget ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">
              {dealCount > 0
                ? `В этапе ${dealCount} сделок(и). Выберите этап, куда их перенести:`
                : `Активных сделок нет, но в этапе ещё ${totalCount} в корзине. Выберите этап для переноса:`}
            </p>
            <select
              autoFocus
              value={targetStageId}
              onChange={e => setTargetStageId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Выберите этап...</option>
              {otherStages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {targetStageId && requiredFields.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-0.5">
                <p className="font-medium">На выбранном этапе обязательны поля:</p>
                {requiredFields.map(f => (
                  <p key={f.key}>{f.label} — не заполнено у {f.missingCount} из {dealCount} сделок</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-3">Сделок в этапе нет, можно удалять.</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
          <button
            onClick={() => onConfirm(targetStageId || undefined)}
            disabled={!canConfirm || isPending}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Lost reasons section ---

function LostReasonsSection() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: reasons = [] } = useQuery<LostReason[]>({
    queryKey: ['lostReasons'],
    queryFn: () => lostReasonsApi.list(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lostReasons'] })

  const createMutation = useMutation({
    mutationFn: (name: string) => lostReasonsApi.create({ name, order: reasons.length }),
    onSuccess: () => { invalidate(); setNewName(''); setShowAdd(false) },
  })
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name?: string; active?: boolean }) =>
      lostReasonsApi.update(data.id, { name: data.name, active: data.active }),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => lostReasonsApi.delete(id),
    onSuccess: invalidate,
    onError: () => alert('Причина используется в сделках — деактивируйте её вместо удаления'),
  })

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Причины потери</h2>
          <p className="text-xs text-gray-400 mt-0.5">Запрашиваются при переносе сделки в этап «Потеряно»</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить
        </button>
      </div>

      <div className="space-y-1.5">
        {reasons.map(r =>
          editingId === r.id ? (
            <div key={r.id} className="flex items-center gap-2 p-2.5 border border-blue-200 rounded-lg bg-blue-50">
              <input
                autoFocus
                className="flex-1 px-2.5 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editName.trim()) updateMutation.mutate({ id: r.id, name: editName.trim() })
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
              <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={() => { if (editName.trim()) updateMutation.mutate({ id: r.id, name: editName.trim() }) }}
                disabled={!editName.trim() || updateMutation.isPending}
                className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              key={r.id}
              className={cn(
                'flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-100 group hover:border-gray-200',
                !r.active && 'opacity-50'
              )}
            >
              <p className="flex-1 text-sm text-gray-900">{r.name}</p>
              {!r.active && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 shrink-0">Скрыта</span>
              )}
              {(r._count?.deals ?? 0) > 0 && (
                <span className="text-xs text-gray-400 shrink-0">{r._count!.deals}</span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditingId(r.id); setEditName(r.name) }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Переименовать"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => updateMutation.mutate({ id: r.id, active: !r.active })}
                  className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded"
                >
                  {r.active ? 'Скрыть' : 'Вернуть'}
                </button>
                <button
                  onClick={() => {
                    if ((r._count?.deals ?? 0) > 0) {
                      alert('Причина используется в сделках — деактивируйте её вместо удаления')
                      return
                    }
                    if (confirm(`Удалить причину «${r.name}»?`)) deleteMutation.mutate(r.id)
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
        <div className="mt-1.5 flex items-center gap-2 p-2.5 border border-blue-200 rounded-lg bg-blue-50">
          <input
            autoFocus
            className="flex-1 px-2.5 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="Например: Дорого"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim())
              if (e.key === 'Escape') { setShowAdd(false); setNewName('') }
            }}
          />
          <button onClick={() => { setShowAdd(false); setNewName('') }} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => { if (newName.trim()) createMutation.mutate(newName.trim()) }}
            disabled={!newName.trim() || createMutation.isPending}
            className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      )}

      {reasons.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-6">
          Нет причин. Добавьте варианты — например «Дорого», «Ушёл к конкурентам», «Не отвечает».
        </p>
      )}
    </div>
  )
}

// --- Pipeline row in sidebar ---

interface PipelineRowProps {
  pipeline: Pipeline
  isSelected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

function PipelineRow({ pipeline, isSelected, onSelect, onRename, onDelete }: PipelineRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(pipeline.name)

  const handleSave = () => {
    if (nameValue.trim() && nameValue.trim() !== pipeline.name) {
      onRename(nameValue.trim())
    }
    setRenaming(false)
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setNameValue(pipeline.name); setRenaming(false) } }}
          onBlur={handleSave}
        />
        <button onClick={handleSave} className="p-1 text-blue-600 hover:text-blue-700 shrink-0">
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const dealCount = (pipeline as Pipeline & { _count?: { deals: number } })._count?.deals ?? 0

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
      )}
    >
      <span className="flex-1 text-sm font-medium truncate">{pipeline.name}</span>
      {dealCount > 0 && (
        <span className="text-xs text-gray-400 shrink-0">{dealCount}</span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => { setRenaming(true); setNameValue(pipeline.name) }}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
          title="Переименовать"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            if (dealCount > 0) {
              alert(`Нельзя удалить воронку с ${dealCount} сделками. Сначала переместите или удалите все сделки.`)
              return
            }
            if (confirm(`Удалить воронку «${pipeline.name}»?`)) onDelete()
          }}
          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
          title="Удалить"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {isSelected && <ChevronRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
    </div>
  )
}

// --- Main page ---

export default function PipelineSettingsPage() {
  const queryClient = useQueryClient()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null)
  const [showAddStage, setShowAddStage] = useState(false)
  const [localStages, setLocalStages] = useState<Stage[]>([])
  const [showCreatePipeline, setShowCreatePipeline] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState('')

  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: pipelinesApi.list,
  })

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId) ?? pipelines[0]

  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id)
    }
  }, [pipelines, selectedPipelineId])

  useEffect(() => {
    if (selectedPipeline?.stages) setLocalStages(selectedPipeline.stages)
  }, [selectedPipeline])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['pipelines'] })
    queryClient.invalidateQueries({ queryKey: ['kanban'] })
  }

  const createPipelineMutation = useMutation({
    mutationFn: (name: string) => pipelinesApi.create({ name }),
    onSuccess: (created) => {
      invalidateAll()
      setSelectedPipelineId(created.id)
      setNewPipelineName('')
      setShowCreatePipeline(false)
    },
  })

  const renamePipelineMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => pipelinesApi.update(id, { name }),
    onSuccess: invalidateAll,
  })

  const deletePipelineMutation = useMutation({
    mutationFn: (id: string) => pipelineDeleteApi.delete(id),
    onSuccess: (_, deletedId) => {
      invalidateAll()
      if (selectedPipelineId === deletedId) {
        setSelectedPipelineId(null)
      }
    },
  })

  const createStageMutation = useMutation({
    mutationFn: ({ name, color, type }: { name: string; color: string; type: StageType }) =>
      stagesApi.create(selectedPipeline!.id, { name, color, type, order: localStages.length }),
    onSuccess: () => { invalidateAll(); setShowAddStage(false) },
  })

  const updateStageMutation = useMutation({
    mutationFn: ({ id, name, color, type }: { id: string; name: string; color: string; type: StageType }) =>
      stagesApi.update(id, { name, color, type }),
    onSuccess: () => { invalidateAll(); setEditingStage(null) },
  })

  const deleteStageMutation = useMutation({
    mutationFn: ({ id, targetStageId }: { id: string; targetStageId?: string }) => stagesApi.delete(id, targetStageId),
    onSuccess: () => { invalidateAll(); setStageToDelete(null) },
    onError: () => alert('Не удалось удалить этап — попробуйте выбрать другой этап для переноса сделок'),
  })

  const reorderMutation = useMutation({
    mutationFn: (reordered: Stage[]) =>
      Promise.all(reordered.map((s, i) => stagesApi.update(s.id, { order: i }))),
    onSuccess: invalidateAll,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localStages.findIndex(s => s.id === active.id)
    const newIndex = localStages.findIndex(s => s.id === over.id)
    const reordered = arrayMove(localStages, oldIndex, newIndex)
    setLocalStages(reordered)
    reorderMutation.mutate(reordered)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Настройка воронок</h1>
        <p className="text-xs text-gray-500 mt-0.5">Управление воронками продаж и их этапами</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: pipeline list */}
        <div className="w-56 border-r border-gray-100 bg-gray-50 flex flex-col overflow-y-auto">
          <div className="p-3 space-y-0.5">
            {pipelines.map(p => (
              <PipelineRow
                key={p.id}
                pipeline={p}
                isSelected={selectedPipeline?.id === p.id}
                onSelect={() => { setSelectedPipelineId(p.id); setEditingStage(null); setShowAddStage(false) }}
                onRename={name => renamePipelineMutation.mutate({ id: p.id, name })}
                onDelete={() => deletePipelineMutation.mutate(p.id)}
              />
            ))}
          </div>

          <div className="p-3 border-t border-gray-100 mt-auto">
            {showCreatePipeline ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  placeholder="Название воронки"
                  value={newPipelineName}
                  onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim())
                    if (e.key === 'Escape') { setShowCreatePipeline(false); setNewPipelineName('') }
                  }}
                />
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => { setShowCreatePipeline(false); setNewPipelineName('') }}
                    className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => { if (newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim()) }}
                    disabled={!newPipelineName.trim() || createPipelineMutation.isPending}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Создать
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreatePipeline(true)}
                className="flex items-center gap-1.5 w-full text-xs text-blue-600 hover:text-blue-700 px-1 py-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Новая воронка
              </button>
            )}
          </div>
        </div>

        {/* Right: stages editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedPipeline ? (
            <div className="max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">
                  Этапы: {selectedPipeline.name}
                </h2>
                <button
                  onClick={() => { setShowAddStage(true); setEditingStage(null) }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Добавить этап
                </button>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {localStages.map(stage =>
                      editingStage?.id === stage.id ? (
                        <StageForm
                          key={stage.id}
                          initialName={stage.name}
                          initialColor={stage.color}
                          initialType={stage.type}
                          isPending={updateStageMutation.isPending}
                          onSave={(name, color, type) => updateStageMutation.mutate({ id: stage.id, name, color, type })}
                          onCancel={() => setEditingStage(null)}
                        />
                      ) : (
                        <SortableStage
                          key={stage.id}
                          stage={stage}
                          onEdit={s => { setEditingStage(s); setShowAddStage(false) }}
                          onDelete={s => setStageToDelete(s)}
                        />
                      )
                    )}
                  </div>
                </SortableContext>
              </DndContext>

              {showAddStage && (
                <div className="mt-1.5">
                  <StageForm
                    isPending={createStageMutation.isPending}
                    onSave={(name, color, type) => createStageMutation.mutate({ name, color, type })}
                    onCancel={() => setShowAddStage(false)}
                  />
                </div>
              )}

              {localStages.length === 0 && !showAddStage && (
                <p className="text-sm text-gray-400 text-center py-8">
                  Нет этапов. Нажмите «Добавить этап», чтобы создать первый.
                </p>
              )}

              {reorderMutation.isError && (
                <p className="mt-2 text-xs text-red-500">Ошибка при сохранении порядка этапов</p>
              )}

              <LostReasonsSection />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Выберите воронку слева или создайте новую</p>
          )}
        </div>
      </div>

      {stageToDelete && (
        <DeleteStageDialog
          stage={stageToDelete}
          otherStages={localStages.filter(s => s.id !== stageToDelete.id)}
          isPending={deleteStageMutation.isPending}
          onCancel={() => setStageToDelete(null)}
          onConfirm={targetStageId => deleteStageMutation.mutate({ id: stageToDelete.id, targetStageId })}
        />
      )}
    </div>
  )
}
