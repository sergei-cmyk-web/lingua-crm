'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Phone, Mail, Building2, Save, Pencil, Plus, X, Trash2 } from 'lucide-react'
import { contactsApi, companiesApi } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { SubscriptionCard } from '@/components/deal/SubscriptionCard'
import { TagInput } from '@/components/entity/TagInput'

export default function ContactPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore(s => s.user?.permissions?.includes('trash.manage') ?? false)
  const canEdit = useAuthStore(s => s.user?.permissions?.includes('entities.edit') ?? false)

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.get(id),
  })

  const { data: companiesData } = useQuery({
    queryKey: ['companies', ''],
    queryFn: () => companiesApi.list({ limit: 100 }),
  })
  const companies = companiesData?.companies ?? []

  const { data: tagSuggestions = [] } = useQuery({
    queryKey: ['contacts', 'tags'],
    queryFn: () => contactsApi.tags(),
  })

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [addingPhone, setAddingPhone] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [addingEmail, setAddingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    if (contact) {
      setName(contact.name ?? '')
      setPhone(contact.phone ?? '')
      setEmail(contact.email ?? '')
      setTelegramUsername(contact.telegramUsername ?? '')
      setCompanyId(contact.companyId ?? '')
      setTags(contact.tags ?? [])
    }
  }, [contact])

  const updateMutation = useMutation({
    mutationFn: () => contactsApi.update(id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      telegramUsername: telegramUsername.replace(/^@/, '').trim() || undefined,
      companyId: companyId || undefined,
      tags,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditing(false)
    },
  })

  // Мягкое удаление в корзину (только админ); сделки контакта остаются в воронке
  const deleteMutation = useMutation({
    mutationFn: () => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      router.push('/contacts')
    },
  })

  const addPhoneMutation = useMutation({
    mutationFn: () => contactsApi.addPhone(id, newPhone.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      setNewPhone('')
      setAddingPhone(false)
    },
  })

  const removePhoneMutation = useMutation({
    mutationFn: (phoneId: string) => contactsApi.removePhone(id, phoneId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contact', id] }),
  })

  const addEmailMutation = useMutation({
    mutationFn: () => contactsApi.addEmail(id, newEmail.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      setNewEmail('')
      setAddingEmail(false)
    },
  })

  const removeEmailMutation = useMutation({
    mutationFn: (emailId: string) => contactsApi.removeEmail(id, emailId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contact', id] }),
  })

  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500'

  if (isLoading) return <div className="p-8 text-gray-400 text-sm">Загрузка...</div>
  if (!contact) return <div className="p-8 text-gray-400 text-sm">Контакт не найден</div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
        <button onClick={() => router.push('/contacts')} className="p-1 rounded hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1">{contact.name}</h1>
        {!editing ? (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm(`Удалить контакт «${contact.name}»? Он попадёт в корзину и будет храниться там 30 дней. Сделки контакта останутся в воронке.`)) {
                    deleteMutation.mutate()
                  }
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            )}
            {canEdit && <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </button>}
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Отмена</button>
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!name.trim() || updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Main info */}
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Основная информация</h2>
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Имя *</label>
                  <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Основной телефон</label>
                  <input className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@example.com" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Telegram @username</label>
                  <input className={inputClass} value={telegramUsername} onChange={e => setTelegramUsername(e.target.value)} placeholder="@username" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Компания</label>
                  <select className={inputClass} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                    <option value="">— без компании —</option>
                    {companies.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Теги</label>
                  <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-6">
                  <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-semibold shrink-0">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{contact.name}</p>
                    {contact.company && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {contact.company.name}
                      </p>
                    )}
                  </div>
                </div>
                {contact.telegramUsername && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="text-sm">✈️</span> @{contact.telegramUsername}
                    </span>
                  </div>
                )}
                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag: string) => (
                      <span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                {/* Emails */}
                <div className="space-y-1 pt-1">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <a href={`mailto:${contact.email}`} className="text-gray-700 hover:text-blue-600">{contact.email}</a>
                      <span className="text-xs text-gray-400">(основной)</span>
                    </div>
                  )}
                  {(contact.emails ?? []).map((e: { id: string; email: string; label?: string | null }) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm group">
                      <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <a href={`mailto:${e.email}`} className="text-gray-700 hover:text-blue-600">{e.email}</a>
                      {e.label && <span className="text-xs text-gray-400">({e.label})</span>}
                      <button
                        onClick={() => removeEmailMutation.mutate(e.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 ml-auto"
                      >
                        <X className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                  {addingEmail ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        autoFocus
                        type="email"
                        className="text-sm px-2 py-1 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="ivan@example.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newEmail.trim()) addEmailMutation.mutate()
                          if (e.key === 'Escape') setAddingEmail(false)
                        }}
                      />
                      <button onClick={() => addEmailMutation.mutate()} disabled={!newEmail.trim()} className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Добавить</button>
                      <button onClick={() => setAddingEmail(false)} className="text-sm text-gray-400 hover:text-gray-600">Отмена</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingEmail(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1">
                      <Plus className="h-3.5 w-3.5" /> Добавить email
                    </button>
                  )}
                  {addEmailMutation.isError && <p className="text-xs text-red-500">Не удалось добавить email — проверьте формат</p>}
                </div>
                {/* Phones */}
                <div className="space-y-1 pt-1">
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-700">{contact.phone}</span>
                      <span className="text-xs text-gray-400">(основной)</span>
                    </div>
                  )}
                  {(contact.phones ?? []).map((p: { id: string; phone: string; label?: string | null }) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm group">
                      <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-700">{p.phone}</span>
                      {p.label && <span className="text-xs text-gray-400">({p.label})</span>}
                      <button
                        onClick={() => removePhoneMutation.mutate(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 ml-auto"
                      >
                        <X className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                  {addingPhone ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        autoFocus
                        className="text-sm px-2 py-1 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="+7 999 123-45-67"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newPhone.trim()) addPhoneMutation.mutate()
                          if (e.key === 'Escape') setAddingPhone(false)
                        }}
                      />
                      <button onClick={() => addPhoneMutation.mutate()} disabled={!newPhone.trim()} className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Добавить</button>
                      <button onClick={() => setAddingPhone(false)} className="text-sm text-gray-400 hover:text-gray-600">Отмена</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingPhone(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1">
                      <Plus className="h-3.5 w-3.5" /> Добавить телефон
                    </button>
                  )}
                </div>
              </div>
            )}
            {updateMutation.isError && <p className="mt-2 text-sm text-red-500">Ошибка при сохранении</p>}
          </div>

          {/* Абонементы */}
          <SubscriptionCard contactId={contact.id} />

          {/* Deals */}
          {contact.deals?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Сделки ({contact.deals.length})</h2>
              <div className="space-y-2">
                {contact.deals.map((deal: { id: string; title: string; stage?: { name: string; color: string }; budget?: number | null; createdAt: string }) => (
                  <div
                    key={deal.id}
                    onClick={() => window.open(`/deals/${deal.id}`, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(deal.createdAt)}</p>
                    </div>
                    {deal.stage && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: deal.stage.color }}>
                        {deal.stage.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {contact.tasks?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Задачи ({contact.tasks.length})</h2>
              <div className="space-y-2">
                {contact.tasks.map((task: { id: string; title: string; completed: boolean; result?: string | null; dueDate?: string | null }) => (
                  <div key={task.id} className={cn('flex items-start gap-3 p-3 rounded-lg border', task.completed ? 'border-gray-100 opacity-60' : 'border-gray-200')}>
                    <div className={cn('mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0', task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300')}>
                      {task.completed && <span className="text-white text-xs">✓</span>}
                    </div>
                    <div className="flex-1">
                      <p className={cn('text-sm', task.completed && 'line-through text-gray-400')}>{task.title}</p>
                      {task.completed && task.result && <p className="text-xs text-gray-500 mt-0.5">Результат: {task.result}</p>}
                    </div>
                    {task.dueDate && <p className="text-xs text-gray-400">{formatDateTime(task.dueDate)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
