'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, KeyRound, Lock } from 'lucide-react'
import { usersApi, rolesApi, type ManagedUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { PERMISSIONS, ALL_PERMISSIONS, type Role, type PermissionKey } from '@crm/shared'

const inputCls =
  'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

// ==== Пользователи ====

function UserForm({
  roles,
  onSave,
  onCancel,
  isPending,
}: {
  roles: Role[]
  onSave: (data: { name: string; email: string; password: string; roleId: string }) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [form, setForm] = useState({ name: '', email: '', password: '', roleId: roles[0]?.id ?? '' })
  const valid = form.name.trim() && form.email.includes('@') && form.password.length >= 6 && form.roleId

  return (
    <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input autoFocus className={inputCls} placeholder="Имя" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className={inputCls} placeholder="Email" type="email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input className={inputCls} placeholder="Пароль (мин. 6 символов)" type="password" value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        <select className={inputCls} value={form.roleId}
          onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        <button
          onClick={() => valid && onSave({ ...form, name: form.name.trim() })}
          disabled={!valid || isPending}
          className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ==== Роли ====

function RoleForm({
  initial,
  nameLocked,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: { name: string; permissions: string[] }
  nameLocked?: boolean
  onSave: (data: { name: string; permissions: string[] }) => void
  onCancel: () => void
  isPending?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions ?? []))

  const toggle = (key: string) =>
    setPerms(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
      <input
        autoFocus={!nameLocked}
        disabled={nameLocked}
        className={cn(inputCls, nameLocked && 'opacity-60 cursor-not-allowed')}
        placeholder="Название роли (напр. «Старший менеджер»)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 py-1">
        {ALL_PERMISSIONS.map((key: PermissionKey) => (
          <label key={key} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={perms.has(key)}
              onChange={() => toggle(key)}
            />
            <span>{PERMISSIONS[key]}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        <button
          onClick={() => name.trim() && onSave({ name: name.trim(), permissions: Array.from(perms) })}
          disabled={!name.trim() || isPending}
          className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function UsersSettingsPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)

  const { data: users = [], error: usersError } = useQuery<ManagedUser[]>({
    queryKey: ['managed-users'],
    queryFn: usersApi.listAll,
  })
  const { data: roles = [] } = useQuery<Role[]>({ queryKey: ['roles'], queryFn: rolesApi.list })

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['managed-users'] })
    queryClient.invalidateQueries({ queryKey: ['users'] }) // пикеры ответственных
    queryClient.invalidateQueries({ queryKey: ['roles'] }) // usersCount
  }

  const createUser = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => { invalidateUsers(); setShowAddUser(false) },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      alert(e.response?.data?.error ?? 'Не удалось создать пользователя'),
  })
  const updateUser = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof usersApi.update>[1]) =>
      usersApi.update(id, data),
    onSuccess: invalidateUsers,
    onError: (e: { response?: { data?: { error?: string } } }) =>
      alert(e.response?.data?.error ?? 'Не удалось сохранить'),
  })

  const createRole = useMutation({
    mutationFn: rolesApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roles'] }); setShowAddRole(false) },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      alert(e.response?.data?.error ?? 'Не удалось создать роль'),
  })
  const updateRole = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof rolesApi.update>[1]) =>
      rolesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roles'] }); setEditingRoleId(null) },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      alert(e.response?.data?.error ?? 'Не удалось сохранить роль'),
  })
  const deleteRole = useMutation({
    mutationFn: rolesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    onError: () => alert('Роль назначена пользователям — сначала переназначьте их на другую роль'),
  })

  const resetPassword = (u: ManagedUser) => {
    const password = prompt(`Новый пароль для ${u.name} (мин. 6 символов):`)
    if (!password) return
    if (password.length < 6) return alert('Пароль слишком короткий')
    updateUser.mutate({ id: u.id, password })
  }

  if (usersError) {
    return <div className="p-6 text-sm text-gray-500">Нет доступа к управлению пользователями.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Пользователи и роли</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Создание сотрудников, назначение ролей и настройка прав. Права применяются в течение минуты.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-8">
          {/* Пользователи */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Пользователи</h2>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить пользователя
              </button>
            </div>

            {showAddUser && (
              <div className="mb-2">
                <UserForm
                  roles={roles}
                  isPending={createUser.isPending}
                  onSave={data => createUser.mutate(data)}
                  onCancel={() => setShowAddUser(false)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              {users.map(u => (
                <div
                  key={u.id}
                  className={cn(
                    'flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group hover:border-gray-200',
                    !u.active && 'opacity-50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {u.name}
                      {u.id === currentUser?.id && <span className="text-xs text-gray-400"> (вы)</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  {!u.active && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 shrink-0">
                      Деактивирован
                    </span>
                  )}
                  <select
                    className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white shrink-0"
                    value={u.role.id}
                    onChange={e => updateUser.mutate({ id: u.id, roleId: e.target.value })}
                  >
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => resetPassword(u)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Сбросить пароль"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => {
                          if (u.active && !confirm(`Деактивировать ${u.name}? Пользователь не сможет войти.`)) return
                          updateUser.mutate({ id: u.id, active: !u.active })
                        }}
                        className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded"
                      >
                        {u.active ? 'Деактивировать' : 'Активировать'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Роли */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Роли</h2>
              <button
                onClick={() => { setShowAddRole(true); setEditingRoleId(null) }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Создать роль
              </button>
            </div>

            {showAddRole && (
              <div className="mb-2">
                <RoleForm
                  isPending={createRole.isPending}
                  onSave={data => createRole.mutate(data)}
                  onCancel={() => setShowAddRole(false)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              {roles.map(role => {
                const isAdminRole = role.isSystem && role.name === 'admin'
                return editingRoleId === role.id ? (
                  <RoleForm
                    key={role.id}
                    initial={{ name: role.name, permissions: role.permissions }}
                    nameLocked={role.isSystem}
                    isPending={updateRole.isPending}
                    onSave={data =>
                      updateRole.mutate({ id: role.id, permissions: data.permissions, ...(role.isSystem ? {} : { name: data.name }) })
                    }
                    onCancel={() => setEditingRoleId(null)}
                  />
                ) : (
                  <div
                    key={role.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group hover:border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate flex items-center gap-1.5">
                        {role.name}
                        {role.isSystem && <Lock className="h-3 w-3 text-gray-300" />}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {isAdminRole
                          ? 'Все права (системная роль)'
                          : `Прав: ${role.permissions.length} · Пользователей: ${role.usersCount ?? 0}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!isAdminRole && (
                        <button
                          onClick={() => { setEditingRoleId(role.id); setShowAddRole(false) }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Редактировать права"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!role.isSystem && (
                        <button
                          onClick={() => {
                            if ((role.usersCount ?? 0) > 0) return alert('Роль назначена пользователям — сначала переназначьте их')
                            if (confirm(`Удалить роль «${role.name}»?`)) deleteRole.mutate(role.id)
                          }}
                          className="p-1 text-gray-400 hover:text-red-500"
                          title="Удалить"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
