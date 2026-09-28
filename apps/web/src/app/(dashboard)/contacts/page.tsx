'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Phone, Mail, X, Trash2, Merge } from 'lucide-react'
import { contactsApi } from '@/lib/api'
import type { Contact } from '@crm/shared'
import { useHasPermission } from '@/store/auth.store'
import { TagInput } from '@/components/entity/TagInput'

type ContactWithChannels = Contact & {
  phones?: { id: string; phone: string }[]
  emails?: { id: string; email: string }[]
}

function ContactDuplicateGroupCard({ group }: { group: ContactWithChannels[] }) {
  const queryClient = useQueryClient()
  const [strategy, setStrategy] = useState<'newest' | 'oldest'>('newest')
  const [selected, setSelected] = useState<Set<string>>(new Set(group.map(c => c.id)))

  const mergeMutation = useMutation({
    mutationFn: () => contactsApi.merge(Array.from(selected), strategy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (mergeMutation.isSuccess) return null

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="space-y-1.5">
        {group.map(c => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-gray-300 shrink-0" />
            <span className="font-medium text-gray-900">{c.name}</span>
            {c.phone && <span className="text-gray-400 text-xs flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" />{c.phone}</span>}
            {c.email && <span className="text-gray-400 text-xs flex items-center gap-1 shrink-0"><Mail className="h-3 w-3" />{c.email}</span>}
            <span className="text-gray-300 text-xs ml-auto shrink-0">{new Date(c.createdAt).toLocaleDateString('ru-RU')}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value as 'newest' | 'oldest')}
          className="text-xs border border-gray-200 rounded-md px-2 py-1"
        >
          <option value="newest">При конфликте: новый по дате создания</option>
          <option value="oldest">При конфликте: старый по дате создания</option>
        </select>
        <button
          onClick={() => mergeMutation.mutate()}
          disabled={selected.size < 2 || mergeMutation.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          <Merge className="h-3.5 w-3.5" />
          Объединить ({selected.size})
        </button>
      </div>
      {mergeMutation.isError && <p className="text-xs text-red-500">Не удалось объединить</p>}
    </div>
  )
}

function ContactDuplicatesDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['contacts', 'duplicates'], queryFn: () => contactsApi.duplicates() })
  const groups: ContactWithChannels[][] = data?.groups ?? []

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Дубли контактов</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Совпадение по телефону или email. Отметьте, кого объединять — остальные уйдут в корзину.</p>
        <div className="flex-1 overflow-y-auto space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-400">Поиск дублей...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Дублей не найдено</p>
          ) : (
            groups.map(group => <ContactDuplicateGroupCard key={group.map(c => c.id).join(',')} group={group} />)
          )}
        </div>
      </div>
    </div>
  )
}

function CreateContactModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [duplicates, setDuplicates] = useState<Contact[] | null>(null)

  const createMutation = useMutation({
    mutationFn: (force?: boolean) => contactsApi.create({ name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      onClose()
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { status: number; data?: { error: string; matches?: Contact[] } } }
      if (axErr.response?.status === 409 && axErr.response.data?.error === 'duplicate_contact') {
        setDuplicates(axErr.response.data.matches ?? [])
      }
    },
  })

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Новый контакт</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        {duplicates && duplicates.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Похожий контакт уже есть — совпадает телефон или email
            </p>
            <div className="space-y-1.5">
              {duplicates.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-md text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {c.phone && <span className="text-gray-400 ml-2">{c.phone}</span>}
                    {c.email && <span className="text-gray-400 ml-2">{c.email}</span>}
                  </div>
                  <button onClick={() => router.push(`/contacts/${c.id}`)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 shrink-0">
                    Открыть
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
              <button
                onClick={() => createMutation.mutate(true)}
                disabled={createMutation.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Всё равно создать
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (name.trim()) createMutation.mutate(false) }} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Имя <span className="text-red-500">*</span></label>
              <input autoFocus required className={inputClass} placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Телефон</label>
              <input className={inputClass} placeholder="+7 999 123-45-67" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" className={inputClass} placeholder="ivan@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {createMutation.isError && <p className="text-sm text-red-500">Ошибка при создании контакта</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
              <button type="submit" disabled={!name.trim() || createMutation.isPending} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const canDelete = useHasPermission('trash.manage')

  const { data: tagOptions = [] } = useQuery({
    queryKey: ['contacts', 'tags'],
    queryFn: () => contactsApi.tags(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, tags],
    queryFn: () => contactsApi.list({ search, limit: 100, ...(tags.length ? { tags: tags.join(',') } : {}) }),
  })

  const contacts: Contact[] = data?.contacts ?? []
  const allSelected = contacts.length > 0 && contacts.every(c => selected.has(c.id))

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map(c => c.id)))

  const bulkDeleteMutation = useMutation({
    mutationFn: () => contactsApi.bulkDelete(Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setSelected(new Set())
    },
  })

  return (
    <div className="flex flex-col h-full">
      {showCreate && <CreateContactModal onClose={() => setShowCreate(false)} />}
      {showDuplicates && <ContactDuplicatesDialog onClose={() => setShowDuplicates(false)} />}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Контакты</h1>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={() => setShowDuplicates(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors">
              <Merge className="h-3.5 w-3.5" />
              Найти дубли
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </button>
        </div>
      </div>

      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по имени..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="max-w-sm flex-1">
          <TagInput value={tags} onChange={setTags} suggestions={tagOptions} placeholder="Фильтр по тегам..." />
        </div>
        {canDelete && contacts.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300" />
            Выбрать все
          </label>
        )}
      </div>

      {selected.size > 0 && canDelete && (
        <div className="flex items-center gap-3 px-6 py-2 bg-blue-50 border-b border-blue-100">
          <button onClick={() => setSelected(new Set())} className="p-0.5 text-blue-700 hover:text-blue-900">
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm text-blue-800">Выбрано: {selected.size}</span>
          <button
            onClick={() => {
              if (confirm(`Удалить ${selected.size} контакт(ов)?`)) bulkDeleteMutation.mutate()
            }}
            disabled={bulkDeleteMutation.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-red-200 rounded-md text-red-600 bg-white hover:border-red-300 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Загрузка...</p>
        ) : (
          <div className="space-y-1">
            {contacts.map((contact: Contact) => (
              <div key={contact.id} onClick={() => router.push(`/contacts/${contact.id}`)} className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors">
                {canDelete && (
                  <input
                    type="checkbox"
                    checked={selected.has(contact.id)}
                    onChange={() => toggleOne(contact.id)}
                    onClick={e => e.stopPropagation()}
                    className="rounded border-gray-300 shrink-0"
                  />
                )}
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium shrink-0">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                  {contact.company && (
                    <p className="text-xs text-gray-500 truncate">{contact.company.name}</p>
                  )}
                  {contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 text-[10px] leading-none bg-blue-50 text-blue-700 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {contact.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </span>
                  )}
                  {contact.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">Контакты не найдены</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
