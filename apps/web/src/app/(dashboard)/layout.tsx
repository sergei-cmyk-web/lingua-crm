'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, Building2, CheckSquare,
  BarChart2, Settings, LogOut, Kanban, Menu, Trash2, Mail, MessageSquare,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { cn } from '@/lib/utils'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { authApi } from '@/lib/api'
import { DEMO_MODE } from '@/lib/demo/config'
import { DemoBanner } from '@/components/demo/DemoBanner'

const navItems = [
  { href: '/', label: 'Воронка', icon: Kanban, activePrefix: '/' },
  { href: '/deals', label: 'Сделки', icon: LayoutDashboard },
  { href: '/contacts', label: 'Контакты', icon: Users },
  { href: '/companies', label: 'Компании', icon: Building2 },
  { href: '/tasks', label: 'Задачи', icon: CheckSquare },
  { href: '/email', label: 'Почта', icon: Mail, permission: 'section.email' },
  { href: '/chats', label: 'Чаты', icon: MessageSquare, permission: 'section.chats' },
  { href: '/analytics', label: 'Аналитика', icon: BarChart2, permission: 'section.analytics' },
  { href: '/trash', label: 'Корзина', icon: Trash2, permission: 'trash.manage' },
  // Без permissionsAny-гейта: смена своего пароля (/settings/profile) доступна всем,
  // поэтому пункт "Настройки" виден любому залогиненному, не только держателям прав на CRM/интеграции/юзеров.
  { href: '/settings/pipeline', label: 'Настройки', icon: Settings, activePrefix: '/settings' },
] as Array<{
  href: string
  label: string
  icon: typeof Kanban
  activePrefix?: string
  permission?: string
  permissionsAny?: string[]
}>

// Первая доступная страница настроек — для href пункта «Настройки»
function settingsHref(permissions: string[]): string {
  if (permissions.includes('settings.crm')) return '/settings/pipeline'
  if (permissions.includes('settings.integrations')) return '/settings/wazzup'
  if (permissions.includes('users.manage')) return '/settings/users'
  return '/settings/profile'
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, _hasHydrated } = useAuthStore()
  const { sidebarOpen, toggleSidebar } = useUiStore()

  useEffect(() => {
    if (_hasHydrated && !user) router.push('/login')
  }, [user, _hasHydrated, router])

  // Права подтягиваются из /auth/me раз за сеанс: сессии, сохранённые до внедрения ролей,
  // не имеют permissions в persisted-сторе, а правки матрицы ролей подхватываются без re-login.
  useEffect(() => {
    if (!_hasHydrated || !user || DEMO_MODE) return
    authApi.me().then((me) => {
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, ...me } } : s))
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, !!user])

  // Сокет должен жить на весь авторизованный сеанс, а не только пока открыт канбан —
  // иначе join:deal/join:pipeline из других страниц (карточка сделки со /deals, /contacts и т.д.)
  // уходят в никуда, потому что соединение ни разу не устанавливалось (socket.io autoConnect: false).
  // В demo-режиме сокет не подключаем вовсе: мутации не долетают до бэкенда (см. lib/demo/adapter.ts),
  // поэтому реальных событий от «других» пользователей и быть не может — экран обновляется обычным
  // рефетчем React Query после локальной симуляции мутации.
  useEffect(() => {
    if (!_hasHydrated || !user || DEMO_MODE) return
    connectSocket()
    return () => disconnectSocket()
  }, [_hasHydrated, user])

  if (!_hasHydrated) return null
  if (!user) return null

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {DEMO_MODE && <DemoBanner />}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          'flex flex-col bg-white border-r border-gray-200 transition-all duration-200',
          sidebarOpen ? 'w-56' : 'w-14'
        )}>
          <div className="flex items-center h-14 px-3 border-b border-gray-200 gap-2">
            <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-gray-100">
              <Menu className="h-4 w-4 text-gray-500" />
            </button>
            {sidebarOpen && (
              <span className="text-sm font-semibold text-gray-900 truncate">LinguaCRM</span>
            )}
          </div>

          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {navItems
              .filter(item => {
                const perms = user.permissions ?? []
                if (item.permission) return perms.includes(item.permission)
                if (item.permissionsAny) return item.permissionsAny.some(p => perms.includes(p))
                return true
              })
              .map(({ href, label, icon: Icon, activePrefix }) => (
              <Link
                key={href}
                href={activePrefix === '/settings' ? settingsHref(user.permissions ?? []) : href}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors',
                  (activePrefix
                    ? pathname.startsWith(activePrefix) && (activePrefix !== '/' || pathname === '/')
                    : pathname.startsWith(href))
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </nav>

          <div className="px-2 py-3 border-t border-gray-200">
            {sidebarOpen && (
              <div className="px-2 py-1 mb-1">
                <p className="text-xs font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={() => { authApi.logout().catch(() => {}).finally(() => { logout(); router.push('/login') }) }}
              className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>Выйти</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
