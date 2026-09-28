'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, GripVertical, Pencil, Check, X, ChevronDown } from 'lucide-react'
import { fieldsApi, pipelinesApi } from '@/lib/api'
import type { FieldDefinition, EntityType, FieldOption } from '@crm/shared'
import { cn } from '@/lib/utils'

const entityLabels: Record<EntityType, string> = {
  deal: 'Сделки',
  contact: 'Контакты',
  company: 'Компании',
}

const fieldTypeLabels: Record<string, string> = {
  text: 'Текст',
  number: 'Число',
  select: 'Список',
  multiselect: 'Мультисписок',
  date: 'Дата',
  checkbox: 'Флаг',
  textarea: 'Многострочный текст',
}

export default function FieldsPage() {
  const [entityType, setEntityType] = useState<EntityType>('deal')
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: fields = [] } = useQuery<FieldDefinition[]>({
    queryKey: ['fields', entityType],
    queryFn: () => fieldsApi.list({ entityType }),
  })

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: fieldsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fields'] }),
  })

  const updateLabelMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => fieldsApi.update(id, { label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fields'] }),
  })

  const updateStagesMutation = useMutation({
    mutationFn: ({ id, stageIds }: { id: string; stageIds: string[] }) =>
      fieldsApi.update(id, { requiredAtStageIds: stageIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fields'] }),
  })

  const updateOptionsMutation = useMutation({
    mutationFn: ({ id, options }: { id: string; options: FieldOption[] }) =>
      fieldsApi.update(id, { options }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fields'] }),
  })

  // Flatten all stages for the stage selector
  const allStages = (pipelines as Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }>)
    .flatMap(p => (p.stages ?? []).map(s => ({ id: s.id, name: s.name, pipelineName: p.name })))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Кастомные поля</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить поле
        </button>
      </div>

      <div className="flex border-b border-gray-200 bg-white px-6">
        {(Object.entries(entityLabels) as [EntityType, string][]).map(([type, label]) => (
          <button
            key={type}
            onClick={() => setEntityType(type)}
            className={cn(
              'px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px',
              entityType === type
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-1.5 max-w-2xl">
          {fields.map(field => (
            <FieldRow
              key={field.id}
              field={field}
              allStages={allStages}
              onDelete={() => deleteMutation.mutate(field.id)}
              onLabelSave={(label) => updateLabelMutation.mutate({ id: field.id, label })}
              onStagesSave={(stageIds) => updateStagesMutation.mutate({ id: field.id, stageIds })}
              onOptionsSave={(options) => updateOptionsMutation.mutate({ id: field.id, options })}
            />
          ))}
          {fields.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              Кастомных полей нет. Добавьте первое.
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <AddFieldModal
          entityType={entityType}
          allStages={allStages}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['fields'] })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

type StageOption = { id: string; name: string; pipelineName: string }

function StageMultiSelect({
  allStages,
  selectedIds,
  onChange,
}: {
  allStages: StageOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const selectedNames = allStages.filter(s => selectedIds.includes(s.id))

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 bg-white"
      >
        {selectedNames.length === 0
          ? 'не обязательное'
          : `обяз. в ${selectedNames.length} этапах`}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[220px] max-h-60 overflow-y-auto">
            {allStages.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-1">Нет этапов</p>
            ) : (
              allStages.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-xs text-gray-700 truncate">
                    <span className="text-gray-400">{s.pipelineName}: </span>{s.name}
                  </span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FieldRow({
  field,
  allStages,
  onDelete,
  onLabelSave,
  onStagesSave,
  onOptionsSave,
}: {
  field: FieldDefinition
  allStages: StageOption[]
  onDelete: () => void
  onLabelSave: (label: string) => void
  onStagesSave: (stageIds: string[]) => void
  onOptionsSave: (options: FieldOption[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [labelInput, setLabelInput] = useState(field.label)
  const [editingOptions, setEditingOptions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasOptions = field.fieldType === 'select' || field.fieldType === 'multiselect'

  const confirmEdit = () => {
    const trimmed = labelInput.trim()
    if (trimmed && trimmed !== field.label) onLabelSave(trimmed)
    setEditing(false)
  }

  const currentStageIds = field.requiredAtStageIds ?? []

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 group">
      <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              autoFocus
              className="text-sm font-medium text-gray-900 border border-blue-400 rounded px-1 py-0.5 focus:outline-none flex-1 min-w-0"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') { setLabelInput(field.label); setEditing(false) } }}
            />
            <button onClick={confirmEdit} className="p-0.5 text-green-600 hover:text-green-700 shrink-0"><Check className="h-4 w-4" /></button>
            <button onClick={() => { setLabelInput(field.label); setEditing(false) }} className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-900">{field.label}</p>
            {field.required && <span className="text-xs text-red-500">*</span>}
            {currentStageIds.length > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                ⚠ в {currentStageIds.length} эт.
              </span>
            )}
            <button
              onClick={() => { setLabelInput(field.label); setEditing(true) }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-blue-600 transition-all"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 font-mono">{field.key}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-400">{fieldTypeLabels[field.fieldType]}</span>
          {hasOptions && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <button
                onClick={() => setEditingOptions(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
              >
                {(field.options ?? []).length} вариантов
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
          {/* Multi-stage required selector — deal fields only */}
          {field.entityType === 'deal' && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <StageMultiSelect
                allStages={allStages}
                selectedIds={currentStageIds}
                onChange={onStagesSave}
              />
            </>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {editingOptions && (
        <EditOptionsModal
          field={field}
          onClose={() => setEditingOptions(false)}
          onSave={(options) => { onOptionsSave(options); setEditingOptions(false) }}
        />
      )}
    </div>
  )
}

function EditOptionsModal({
  field,
  onClose,
  onSave,
}: {
  field: FieldDefinition
  onClose: () => void
  onSave: (options: FieldOption[]) => void
}) {
  const [options, setOptions] = useState<FieldOption[]>(field.options ?? [])
  const [newLabel, setNewLabel] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)

  const renameOption = (index: number, label: string) => {
    setOptions(prev => prev.map((o, i) => (i === index ? { ...o, label } : o)))
  }

  const removeOption = (index: number) => {
    setOptions(prev => prev.filter((_, i) => i !== index))
  }

  const addOption = () => {
    const label = newLabel.trim()
    if (!label) return
    const base = slugify(label) || `opt_${options.length + 1}`
    const existingValues = new Set(options.map(o => o.value))
    let value = base
    let suffix = 2
    while (existingValues.has(value)) {
      value = `${base}_${suffix++}`
    }
    setOptions(prev => [...prev, { value, label }])
    setNewLabel('')
    newInputRef.current?.focus()
  }

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addOption() }
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Варианты «{field.label}»</h2>
        <p className="text-xs text-gray-400 mb-4">
          Переименование не затронет уже сохранённые значения в записях. Удалённый вариант перестанет предлагаться, но останется в старых записях как есть.
        </p>

        <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
          {options.length === 0 && (
            <p className="text-xs text-gray-400 py-2">Вариантов нет.</p>
          )}
          {options.map((opt, i) => (
            <div key={opt.value} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-md border border-gray-100 group">
              <input
                className="flex-1 min-w-0 text-sm text-gray-800 bg-transparent focus:outline-none focus:bg-white rounded px-1"
                value={opt.label}
                onChange={e => renameOption(i, e.target.value)}
              />
              <span className="text-xs text-gray-400 font-mono shrink-0">{opt.value}</span>
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 mb-4">
          <input
            ref={newInputRef}
            className={inputClass}
            placeholder="Новый вариант, Enter для добавления"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <button
            type="button"
            onClick={addOption}
            disabled={!newLabel.trim()}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
          <button
            type="button"
            onClick={() => onSave(options)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function AddFieldModal({
  entityType,
  allStages,
  onClose,
  onSaved,
}: {
  entityType: EntityType
  allStages: StageOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ label: '', fieldType: 'text', required: false })
  const [requiredAtStageIds, setRequiredAtStageIds] = useState<string[]>([])
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [optionInput, setOptionInput] = useState('')
  const [saving, setSaving] = useState(false)
  const optionInputRef = useRef<HTMLInputElement>(null)

  const needsOptions = form.fieldType === 'select' || form.fieldType === 'multiselect'

  const addOption = () => {
    const label = optionInput.trim()
    if (!label) return
    const value = slugify(label) || `opt_${options.length + 1}`
    setOptions(prev => [...prev, { value, label }])
    setOptionInput('')
    optionInputRef.current?.focus()
  }

  const handleOptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addOption() }
  }

  const removeOption = (index: number) => {
    setOptions(prev => prev.filter((_, i) => i !== index))
  }

  const toggleStage = (id: string) => {
    setRequiredAtStageIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (needsOptions && options.length === 0) return
    setSaving(true)
    const created = await fieldsApi.create({
      ...form,
      entityType,
      order: 99,
      options: needsOptions ? options : undefined,
      requiredAtStageIds: requiredAtStageIds.length > 0 ? requiredAtStageIds : undefined,
    })
    setSaving(false)
    if (created?.duplicate) {
      alert(`Поле с таким названием уже есть — создано с системным именем «${created.key}», чтобы отличать от исходного`)
    }
    onSaved()
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Новое поле</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Название</label>
            <input required className={inputClass} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Уровень ученика" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Тип поля</label>
            <select
              className={inputClass}
              value={form.fieldType}
              onChange={e => { setForm(f => ({ ...f, fieldType: e.target.value })); setOptions([]) }}
            >
              {Object.entries(fieldTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {needsOptions && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Варианты выбора <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1 mb-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-md border border-gray-100 group">
                    <span className="flex-1 text-sm text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-400 font-mono">{opt.value}</span>
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  ref={optionInputRef}
                  className={inputClass}
                  placeholder="Название варианта, Enter для добавления"
                  value={optionInput}
                  onChange={e => setOptionInput(e.target.value)}
                  onKeyDown={handleOptionKeyDown}
                />
                <button
                  type="button"
                  onClick={addOption}
                  disabled={!optionInput.trim()}
                  className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {needsOptions && options.length === 0 && (
                <p className="mt-1 text-xs text-red-500">Добавьте хотя бы один вариант</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
              <span className="text-sm text-gray-700">Всегда обязательное</span>
            </label>
            {entityType === 'deal' && allStages.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Обязательное при переходе в этапы
                  {requiredAtStageIds.length > 0 && (
                    <span className="ml-1 text-amber-600">({requiredAtStageIds.length} выбрано)</span>
                  )}
                </label>
                <div className="border border-gray-200 rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                  {allStages.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requiredAtStageIds.includes(s.id)}
                        onChange={() => toggleStage(s.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">
                        <span className="text-gray-400">{s.pipelineName}: </span>{s.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
            <button
              type="submit"
              disabled={saving || (needsOptions && options.length === 0)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
