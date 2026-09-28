import type { AxiosAdapter, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { applyOverlayToGetResponse } from './merge'
import { matchRoute, DemoApiError, setApiClient } from './handlers'

// Пути, которые всегда идут на реальный backend, даже в demo-режиме — вход, обновление токена
// (см. Часть 2 плана демо-стенда: авто-логин использует настоящий /auth/login) и выход (кнопка
// "Выйти из демо" реально гасит httpOnly-cookie сессию перед уходом на другой домен, а не просто
// падает в общий "нет обработчика" фолбэк — сервер и так держит /auth/logout в demoGuard-паспорте).
const PASSTHROUGH = new Set(['/auth/login', '/auth/refresh', '/auth/logout'])

function buildResponse(config: AxiosRequestConfig, data: unknown, status: number): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config: config as any }
}

function parseBody(data: unknown): any {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data // FormData и т.п. — обработчики читают через .get(...)
}

// Подменяет adapter клиента: GET уходит на реальный backend и домерживается с локальным
// оверлеем (merge.ts); остальные методы перехватываются целиком и симулируются в браузере
// (handlers.ts) — реальный HTTP-запрос для них не уходит вообще.
export function installDemoAdapter(client: AxiosInstance) {
  setApiClient(client)
  // В axios 1.x defaults.adapter — НЕ функция, а массив имён встроенных адаптеров
  // (['xhr','http','fetch']), которые axios резолвит сам внутри dispatchRequest. Вызвать этот
  // массив напрямую как функцию нельзя (была ошибка "originalAdapter is not a function",
  // в минифицированной сборке — "e is not a function"). Правильный способ сделать "настоящий"
  // сетевой запрос — передать этот же спек через config.adapter на конкретном вызове: axios
  // резолвит адаптер per-request приоритетнее defaults.adapter, поэтому обходит наш override
  // без рекурсии (проверено отдельно).
  const realAdapterSpec = client.defaults.adapter
  const realRequest = (config: AxiosRequestConfig) => client.request({ ...config, adapter: realAdapterSpec })

  const demoAdapter: AxiosAdapter = async (config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = (config.url ?? '').split('?')[0]

    if (method === 'GET') {
      const response = await realRequest(config)
      response.data = applyOverlayToGetResponse(url, response.data)
      return response
    }

    if (PASSTHROUGH.has(url)) return realRequest(config)

    const match = matchRoute(method, url)
    if (!match) {
      // Эндпоинт мутации без demo-обработчика — не должно случаться в норме (см.
      // lib/demo/handlers.ts), но лучше вернуть "успех" без действия, чем уронить UI.
      console.error(`[demo] Нет обработчика мутации для ${method} ${url} — добавьте маршрут в lib/demo/handlers.ts`)
      return buildResponse(config, { ok: true, demo: true }, 200)
    }

    try {
      // config.params (axios query-параметры) — единственный такой случай сегодня:
      // stagesApi.delete(stageId, targetStageId) шлёт targetStageId через params на DELETE,
      // а не через тело/URL. Мержим их в body, чтобы handlers.ts мог их прочитать одним способом
      // (FormData — исключение, спред развалил бы её до {}, обработчики читают её через .get(...)).
      const parsedBody = parseBody(config.data)
      const body = parsedBody instanceof FormData ? parsedBody : { ...parsedBody, ...(config.params ?? {}) }
      const result = await match.handler(match.params, body)
      return buildResponse(config, result.data, result.status ?? (method === 'POST' ? 201 : 200))
    } catch (err) {
      if (err instanceof DemoApiError) {
        const axiosLikeError: any = new Error(err.message)
        axiosLikeError.isAxiosError = true
        axiosLikeError.response = buildResponse(config, err.data, err.status)
        throw axiosLikeError
      }
      throw err
    }
  }

  client.defaults.adapter = demoAdapter
}
