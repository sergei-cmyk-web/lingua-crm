import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: string
  permissions?: string[] // отсутствует у сессий, сохранённых до внедрения ролей — рефетчится из /auth/me
}

interface AuthStore {
  user: User | null
  _hasHydrated: boolean
  setAuth: (user: User) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

// Токены — httpOnly cookie, выставляются бэкендом (см. lib/api/client.ts) и никогда не видны
// JS/localStorage. Стор хранит только профиль пользователя для UI/роутинга.
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      _hasHydrated: false,
      setAuth: (user) => set({ user }),
      logout: () => set({ user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'crm-auth',
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

/** Хук проверки права текущего пользователя (ключи — PermissionKey из @crm/shared). */
export function useHasPermission(permission: string): boolean {
  return useAuthStore((s) => s.user?.permissions?.includes(permission) ?? false)
}
