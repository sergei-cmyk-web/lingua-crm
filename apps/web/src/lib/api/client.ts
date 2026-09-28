import axios from 'axios'
import { DEMO_MODE } from '../demo/config'

// Use relative URLs so requests go through Next.js rewrite proxy (/api/* → backend)
// This avoids CORS entirely since requests stay on the same origin
const BASE = typeof window !== 'undefined' ? '/api' : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`

// access_token/refresh_token are httpOnly cookies — the browser attaches them automatically,
// nothing to read or store here. withCredentials is what makes axios send/accept cookies at all.
export const apiClient = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

// Double-submit CSRF: csrf_token cookie is intentionally NOT httpOnly so this can read it back
// and echo it as a header — proves the request came from our own JS, not a forged cross-site one.
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && config.method && config.method.toUpperCase() !== 'GET') {
    const csrfToken = getCookie('csrf_token')
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true
      try {
        await apiClient.post('/auth/refresh')
        return apiClient(originalRequest)
      } catch {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Demo-режим: мутации перехватываются и симулируются в браузере, GET домерживается с
// локальным оверлеем — см. lib/demo/adapter.ts. Статический импорт здесь создал бы цикл
// (adapter.ts/handlers.ts используют этот же apiClient), поэтому подключаем модуль лениво
// и передаём клиент внутрь явно. ТОЛЬКО в браузере: client.ts — обычный (не 'use client'-only)
// модуль, поэтому его верхнеуровневый код исполняется и при серверном рендере клиентских
// компонентов в Node-процессе Next.js — без этой проверки demo-adapter встал бы на общий
// apiClient всего серверного процесса и подменял бы ответы для ЧУЖИХ SSR-запросов.
if (DEMO_MODE && typeof window !== 'undefined') {
  import('../demo/adapter').then(({ installDemoAdapter }) => installDemoAdapter(apiClient))
}
