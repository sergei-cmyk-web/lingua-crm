'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, Loader2, CheckCircle } from 'lucide-react'
import { emailAccountsApi, usersApi, type EmailAccountSummary, type EmailAccountInput } from '@/lib/api'
import { cn } from '@/lib/utils'

interface FormState {
  label: string
  emailAddress: string
  fromName: string
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  imapHost: string
  imapPort: string
  imapSecure: boolean
  imapUser: string
  imapPassword: string
  ownerId: string
  allowedUserIds: string[]
  active: boolean
}

const emptyForm: FormState = {
  label: '', emailAddress: '', fromName: '',
  smtpHost: '', smtpPort: '465', smtpSecure: true, smtpUser: '', smtpPassword: '',
  imapHost: '', imapPort: '993', imapSecure: true, imapUser: '', imapPassword: '',
  ownerId: '', allowedUserIds: [], active: true,
}

function AccountForm({
  initial = emptyForm,
  accountId,
  users,
  onSave,
  onCancel,
  isPending,
  hasSmtpPassword,
  hasImapPassword,
}: {
  initial?: FormState
  accountId?: string
  users: { id: string; name: string; email?: string }[]
  onSave: (data: EmailAccountInput) => void
  onCancel: () => void
  isPending?: boolean
  hasSmtpPassword?: boolean
  hasImapPassword?: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)
  const testMutation = useMutation({
    mutationFn: () => emailAccountsApi.test(accountId!),
  })

  const valid =
    form.label.trim() && form.emailAddress.trim() && form.smtpHost.trim() && form.smtpUser.trim() &&
    form.imapHost.trim() && form.imapUser.trim() && form.ownerId &&
    (accountId || (form.smtpPassword && form.imapPassword))

  const submit = () => {
    if (!valid) return
    onSave({
      label: form.label.trim(),
      emailAddress: form.emailAddress.trim(),
      fromName: form.fromName.trim() || null,
      smtpHost: form.smtpHost.trim(),
      smtpPort: Number(form.smtpPort),
      smtpSecure: form.smtpSecure,
      smtpUser: form.smtpUser.trim(),
      ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
      imapHost: form.imapHost.trim(),
      imapPort: Number(form.imapPort),
      imapSecure: form.imapSecure,
      imapUser: form.imapUser.trim(),
      ...(form.imapPassword ? { imapPassword: form.imapPassword } : {}),
      ownerId: form.ownerId,
      allowedUserIds: form.allowedUserIds,
      active: form.active,
    })
  }

  const toggleAllowed = (id: string) => {
    setForm(f => ({
      ...f,
      allowedUserIds: f.allowedUserIds.includes(id) ? f.allowedUserIds.filter(u => u !== id) : [...f.allowedUserIds, id],
    }))
  }

  return (
    <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Название</label>
          <input
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Общая почта школы"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Email-адрес</label>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="info@school.ru"
            value={form.emailAddress}
            onChange={e => setForm(f => ({ ...f, emailAddress: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">Имя отправителя (необязательно)</label>
        <input
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Школа LinguaCRM"
          value={form.fromName}
          onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-2 p-2.5 bg-white rounded-md border border-gray-100">
          <p className="text-xs font-medium text-gray-600">SMTP (отправка)</p>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Хост"
            value={form.smtpHost}
            onChange={e => setForm(f => ({ ...f, smtpHost: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              type="number"
              className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Порт"
              value={form.smtpPort}
              onChange={e => setForm(f => ({ ...f, smtpPort: e.target.value }))}
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={form.smtpSecure} onChange={e => setForm(f => ({ ...f, smtpSecure: e.target.checked }))} />
              TLS
            </label>
          </div>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Логин"
            value={form.smtpUser}
            onChange={e => setForm(f => ({ ...f, smtpUser: e.target.value }))}
          />
          <input
            type="password"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={hasSmtpPassword ? '•••••••• (оставьте пустым, чтобы не менять)' : 'Пароль'}
            value={form.smtpPassword}
            onChange={e => setForm(f => ({ ...f, smtpPassword: e.target.value }))}
          />
        </div>

        <div className="space-y-2 p-2.5 bg-white rounded-md border border-gray-100">
          <p className="text-xs font-medium text-gray-600">IMAP (приём)</p>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Хост"
            value={form.imapHost}
            onChange={e => setForm(f => ({ ...f, imapHost: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              type="number"
              className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Порт"
              value={form.imapPort}
              onChange={e => setForm(f => ({ ...f, imapPort: e.target.value }))}
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={form.imapSecure} onChange={e => setForm(f => ({ ...f, imapSecure: e.target.checked }))} />
              TLS
            </label>
          </div>
          <input
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Логин"
            value={form.imapUser}
            onChange={e => setForm(f => ({ ...f, imapUser: e.target.value }))}
          />
          <input
            type="password"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={hasImapPassword ? '•••••••• (оставьте пустым, чтобы не менять)' : 'Пароль'}
            value={form.imapPassword}
            onChange={e => setForm(f => ({ ...f, imapPassword: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Владелец ящика</label>
          <select
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={form.ownerId}
            onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}
          >
            <option value="">— выбрать —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 self-end pb-2">
          <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Активен
        </label>
      </div>

      <div>
        <label className="block text-[10px] text-gray-500 mb-1">Кому ещё разрешено отправлять из этого ящика</label>
        <div className="flex flex-wrap gap-1.5">
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggleAllowed(u.id)}
              className={cn(
                'px-2 py-1 text-xs rounded-md border transition-colors',
                form.allowedUserIds.includes(u.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>

      {accountId && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50 bg-white"
          >
            {testMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Проверить подключение
          </button>
          {testMutation.isSuccess && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3.5 w-3.5" /> Работает
            </span>
          )}
          {testMutation.isError && (
            <span className="text-xs text-red-600">
              {(testMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка'}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
        <button onClick={submit} disabled={!valid || isPending} className="p-1.5 text-blue-600 hover:text-blue-700 disabled:opacity-50">
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function EmailSettingsPage() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: accounts = [] } = useQuery<EmailAccountSummary[]>({
    queryKey: ['email-accounts'],
    queryFn: () => emailAccountsApi.list(),
  })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() })
  const { data: editingAccount, isLoading: editingLoading, isError: editingError } = useQuery({
    queryKey: ['email-accounts', editingId],
    queryFn: () => emailAccountsApi.get(editingId!),
    enabled: !!editingId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] })

  const createMutation = useMutation({
    mutationFn: emailAccountsApi.create,
    onSuccess: () => { invalidate(); setShowAdd(false) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EmailAccountInput>) => emailAccountsApi.update(id, data),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: emailAccountsApi.delete,
    onSuccess: invalidate,
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Почтовые ящики (SMTP/IMAP)</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Общие и личные ящики для отправки и приёма писем из карточки сделки и раздела «Почта».
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => { setShowAdd(true); setEditingId(null) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить ящик
            </button>
          </div>

          <div className="space-y-1.5">
            {accounts.map(acc =>
              editingId === acc.id && editingAccount ? (
                <AccountForm
                  key={acc.id}
                  accountId={acc.id}
                  users={users}
                  hasSmtpPassword={editingAccount.smtpPasswordSet}
                  hasImapPassword={editingAccount.imapPasswordSet}
                  initial={{
                    label: editingAccount.label,
                    emailAddress: editingAccount.emailAddress,
                    fromName: editingAccount.fromName ?? '',
                    smtpHost: editingAccount.smtpHost,
                    smtpPort: String(editingAccount.smtpPort),
                    smtpSecure: editingAccount.smtpSecure,
                    smtpUser: editingAccount.smtpUser,
                    smtpPassword: '',
                    imapHost: editingAccount.imapHost,
                    imapPort: String(editingAccount.imapPort),
                    imapSecure: editingAccount.imapSecure,
                    imapUser: editingAccount.imapUser,
                    imapPassword: '',
                    ownerId: editingAccount.ownerId,
                    allowedUserIds: editingAccount.allowedUserIds,
                    active: editingAccount.active,
                  }}
                  isPending={updateMutation.isPending}
                  onSave={data => updateMutation.mutate({ id: acc.id, ...data })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div
                  key={acc.id}
                  className={cn(
                    'flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group hover:border-gray-200',
                    !acc.active && 'opacity-50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{acc.label}</p>
                    <p className="text-xs text-gray-400">{acc.emailAddress}</p>
                    {editingId === acc.id && editingLoading && (
                      <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
                      </p>
                    )}
                    {editingId === acc.id && editingError && (
                      <p className="text-xs text-red-600 mt-0.5">
                        Не удалось загрузить ящик для редактирования.{' '}
                        <button className="underline" onClick={() => setEditingId(null)}>Скрыть</button>
                      </p>
                    )}
                  </div>
                  {!acc.active && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 shrink-0">Отключён</span>
                  )}
                  <div className={cn(
                    'flex items-center gap-1 transition-opacity shrink-0',
                    editingId === acc.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}>
                    <button
                      onClick={() => { setEditingId(acc.id); setShowAdd(false) }}
                      disabled={editingId === acc.id && editingLoading}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      title="Редактировать"
                    >
                      {editingId === acc.id && editingLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Удалить ящик «${acc.label}»?`)) deleteMutation.mutate(acc.id) }}
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
            <div className="mt-1.5">
              <AccountForm
                users={users}
                isPending={createMutation.isPending}
                onSave={data => createMutation.mutate(data)}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {accounts.length === 0 && !showAdd && (
            <p className="text-sm text-gray-400 text-center py-8">
              Нет почтовых ящиков. Добавьте первый — например общий ящик школы или личный ящик менеджера.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
