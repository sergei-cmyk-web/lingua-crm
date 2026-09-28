'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useDemoOverlayStore } from '@/lib/demo/overlayStore'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/lib/api'
import { MAIN_APP_LOGIN_URL } from '@/lib/demo/config'

// Рендерится только когда DEMO_MODE=true (проверка на уровне вызывающего layout) — сообщает
// посетителю, что он в демо, даёт выйти обратно на основной сайт и сбросить локальный оверлей
// правок (localStorage) к исходным seed-данным.
export function DemoBanner() {
  const queryClient = useQueryClient()
  const resetOverlay = useDemoOverlayStore((s) => s.resetOverlay)
  const logout = useAuthStore((s) => s.logout)

  const handleReset = () => {
    resetOverlay()
    queryClient.invalidateQueries()
  }

  // Уходим на ДРУГОЙ домен (основной сайт) — обычная навигация и так сбросит всё состояние
  // вкладки, но сессию гасим явно и до перехода, чтобы "выход" не зависел от того, успеет ли
  // браузер долистать до window.location.href (см. запрос: сброс сессии даже без перезагрузки).
  const handleExit = () => {
    authApi.logout().catch(() => {})
    logout()
    window.location.href = MAIN_APP_LOGIN_URL
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-900 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={handleExit}
          className="shrink-0 px-2 py-0.5 rounded border border-amber-300 bg-white hover:bg-amber-100 font-medium transition-colors"
        >
          ← Выйти из демо
        </button>
        <span>
          🎭 Демо-режим LinguaCRM — изменения видны только вам в этом браузере и никуда не отправляются
        </span>
      </div>
      <button
        onClick={handleReset}
        className="shrink-0 px-2 py-0.5 rounded border border-amber-300 bg-white hover:bg-amber-100 font-medium transition-colors"
      >
        Сбросить демо
      </button>
    </div>
  )
}
