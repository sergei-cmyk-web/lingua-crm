'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Clock, AlertCircle, Pencil, X, Check, Trash2 } from 'lucide-react'
import { tasksApi, usersApi } from '@/lib/api'
import type { Task } from '@crm/shared'
import { cn, formatDateTime } from '@/lib/utils'

type TaskItem = {
  id: string
  title: string
  completed: boolean
  result?: string | null
  dueDate?: string | null
  assigneeId?: string | null
  assignee?: { id: string; name: string } | null
  deal?: { id: string; title: string } | null
  priority?: string | null
}

const priorityConfig = {
  low: { label: 'Низкий', color: 'text-gray-500' },
  normal: { label: 'Обычный', color: 'text-blue-500' },
  high: { label: 'Высокий', color: 'text-red-500' },
}

function TaskRow({ task, users, onToggle, onComplete, onSave, onDelete }: {
  task: TaskItem
  users: Array<{ id: string; name: string }>
  onToggle: (id: string, completed: boolean) => void
  onComplete: (id: string, result: string) => void
  onSave: (id: string, title: string, dueDate: string, assigneeId: string, result?: string) => void
  onDelete: (id: string) => void
}) {
  const now = new Date()
  const isOverdue = !task.completed && task.dueDate && new Date(task.dueDate) < now
  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDueDate, setEditDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''
  )
  const [editAssigneeId, setEditAssigneeId] = useState(task.assigneeId ?? '')
  const [editResult, setEditResult] = useState(task.result ?? '')

  const handleSave = () => {
    if (editTitle.trim()) {
      onSave(task.id, editTitle.trim(), editDueDate, editAssigneeId, task.completed ? editResult.trim() : undefined)
      setEditing(false)
    }
  }

  const startEdit = () => {
    setEditTitle(task.title)
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '')
    setEditAssigneeId(task.assigneeId ?? '')
    setEditResult(task.result ?? '')
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <input
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
        />
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={editDueDate}
            onChange={e => setEditDueDate(e.target.value)}
          />
          <select
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            value={editAssigneeId}
            onChange={e => setEditAssigneeId(e.target.value)}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        {task.completed && (
          <textarea
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="Результат выполнения"
            value={editResult}
            onChange={e => setEditResult(e.target.value)}
          />
        )}
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleSave} className="p-1.5 text-blue-600 hover:text-blue-700 rounded">
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 bg-white rounded-lg border transition-colors group',
      task.completed ? 'border-gray-100 opacity-60' : 'border-gray-200 hover:border-gray-300'
    )}>
      <button
        onClick={() => task.completed ? onToggle(task.id, task.completed) : setCompleting(true)}
        title={task.completed ? 'Переоткрыть задачу' : 'Закрыть задачу'}
        className={cn(
          'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          task.completed
            ? 'bg-green-500 border-green-500 hover:bg-gray-300 hover:border-gray-300'
            : 'border-gray-300 hover:border-blue-500'
        )}
      >
        {task.completed && <span className="text-white text-xs leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-gray-900', task.completed && 'line-through text-gray-400')}>
          {task.title}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {task.dueDate && (
            <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-red-500' : 'text-gray-400')}>
              {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {formatDateTime(task.dueDate)}
            </span>
          )}
          {task.deal && (
            <span className="text-xs text-blue-600 truncate">{task.deal.title}</span>
          )}
          {task.assignee && (
            <span className="text-xs text-gray-400">{task.assignee.name}</span>
          )}
          {task.priority && (
            <span className={cn('text-xs', priorityConfig[task.priority as keyof typeof priorityConfig]?.color ?? 'text-gray-400')}>
              {priorityConfig[task.priority as keyof typeof priorityConfig]?.label}
            </span>
          )}
        </div>
        {task.completed && task.result && (
          <p className="text-xs text-gray-500 mt-1">Результат: {task.result}</p>
        )}
        {completing && (
          <div className="mt-2 space-y-1.5">
            <textarea
              autoFocus
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              placeholder="Результат выполнения (обязательно)"
              value={result}
              onChange={e => setResult(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCompleting(false); setResult('') }} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded">Отмена</button>
              <button
                onClick={() => { if (result.trim()) { onComplete(task.id, result.trim()); setCompleting(false); setResult('') } }}
                disabled={!result.trim()}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Завершить
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={startEdit} className="p-1 text-gray-300 hover:text-gray-500">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue'>('pending')
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: () => tasksApi.list(filter === 'pending' ? { completed: false } : {}),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const now = new Date()

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      tasksApi.update(id, { completed: !completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) =>
      tasksApi.update(id, { completed: true, result }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, title, dueDate, assigneeId, result }: { id: string; title: string; dueDate: string; assigneeId: string; result?: string }) =>
      tasksApi.update(id, {
        title,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeId: assigneeId || undefined,
        ...(result !== undefined && { result }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const displayTasks = filter === 'overdue'
    ? tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now)
    : tasks

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Задачи</h1>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          {(['all', 'pending', 'overdue'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 py-1 text-xs rounded transition-colors',
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {f === 'all' ? 'Все' : f === 'pending' ? 'Активные' : 'Просроченные'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Загрузка...</p>
        ) : (
          <div className="space-y-1.5">
            {displayTasks.map((task: Task) => (
              <TaskRow
                key={task.id}
                task={task as TaskItem}
                users={users as Array<{ id: string; name: string }>}
                onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
                onComplete={(id, result) => completeMutation.mutate({ id, result })}
                onSave={(id, title, dueDate, assigneeId, result) => updateMutation.mutate({ id, title, dueDate, assigneeId, result })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
            {displayTasks.length === 0 && (
              <div className="text-center py-12">
                <CheckSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Нет задач</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
