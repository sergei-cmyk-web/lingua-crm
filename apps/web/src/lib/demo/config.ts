// Демо-режим: флаг окружения сборки/запуска (локально — `npm run dev:demo`, см. docs/demo-stand.md;
// в докер-сборке — build arg в apps/web/Dockerfile).
// Когда включён, apiClient (lib/api/client.ts) подменяет adapter — мутации симулируются
// в браузере (lib/demo/overlayStore.ts), GET-запросы по-прежнему идут на реальный backend
// и домерживаются с локальным оверлеем (lib/demo/merge.ts).
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// `||`, не `??`: пустая переменная = «не задано» (должно совпадать с prisma/seed-demo.ts).
export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || 'demo@example.com'
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'demo12345'

// Кросс-ссылки между прод-контуром и демо-стендом (два отдельных деплоя, см. docs/demo-stand.md)
// — вне этих двух билдов не заданы, кнопки тогда скрыты.
// URL демо-стенда — кнопка "Демо режим" на странице логина обычной (не-демо) сборки.
export const DEMO_STAND_URL = process.env.NEXT_PUBLIC_DEMO_STAND_URL ?? ''
// URL логина основного сайта — кнопка "Выйти из демо" в этой (демо) сборке.
export const MAIN_APP_LOGIN_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? '/login'
