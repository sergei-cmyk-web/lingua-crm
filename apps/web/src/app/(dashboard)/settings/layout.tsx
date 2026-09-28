'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useHasPermission } from '@/store/auth.store'
import { DEMO_MODE } from '@/lib/demo/config'

const CRM_NAV = [
  { href: '/settings/pipeline',     label: 'Воронка' },
  { href: '/settings/fields',       label: 'Поля' },
  { href: '/settings/automations',  label: 'Автоматизации' },
  { href: '/settings/trials',       label: 'Пробные уроки' },
  { href: '/settings/packages',     label: 'Абонементы' },
]

const INTEGRATION_NAV = [
  { href: '/settings/wazzup',    label: 'WazzUp' },
  { href: '/settings/sms',       label: 'SMS' },
  { href: '/settings/email',     label: 'Почта' },
  { href: '/settings/payments',  label: 'Оплата' },
  { href: '/settings/lead-form', label: 'Лид-форма' },
]

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      className={cn(
        'block px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-blue-50 text-blue-600 font-medium'
          : 'text-gray-600 hover:bg-gray-50'
      )}
    >
      {label}
    </Link>
  )
}

function NavGroup({ title, items, pathname }: { title: string; items: { href: string; label: string }[]; pathname: string }) {
  return (
    <div>
      <div className="px-3 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</div>
      {items.map(item => (
        <NavLink key={item.href} {...item} pathname={pathname} />
      ))}
    </div>
  )
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const canCrm = useHasPermission('settings.crm')
  const canIntegrations = useHasPermission('settings.integrations')
  const canUsers = useHasPermission('users.manage') && !DEMO_MODE // demo-adapter не знает /users

  return (
    <div className="flex h-full">
      <aside className="w-52 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3 space-y-5">
        {canCrm && <NavGroup title="CRM" items={CRM_NAV} pathname={pathname} />}
        {canIntegrations && <NavGroup title="Интеграции" items={INTEGRATION_NAV} pathname={pathname} />}
        {canUsers && (
          <NavGroup title="Доступ" items={[{ href: '/settings/users', label: 'Пользователи' }]} pathname={pathname} />
        )}
        {/* Смена пароля — доступна любому залогиненному, без гейта правом */}
        <NavGroup title="Профиль" items={[{ href: '/settings/profile', label: 'Пароль' }]} pathname={pathname} />
      </aside>
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
