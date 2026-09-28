'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { DEMO_MODE, DEMO_EMAIL, DEMO_PASSWORD, DEMO_STAND_URL } from '@/lib/demo/config'

const schema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
})

type FormValues = z.infer<typeof schema>

// Демо-сборка: отдельного экрана логина посетителю не показываем — сразу авто-логинимся на
// seed-аккаунт (см. prisma/seed-demo.ts) через настоящий /auth/login (не перехватывается
// demo-адаптером, см. lib/demo/adapter.ts) и уходим в канбан.
function DemoAutoLogin() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  useEffect(() => {
    authApi
      .login(DEMO_EMAIL, DEMO_PASSWORD)
      .then((result) => {
        setAuth(result.user)
        router.push('/')
      })
      .catch((err) => {
        // Показываем реальный текст ошибки на экране — иначе диагностировать проблему на
        // проде можно только по консоли браузера, а до неё не у всех есть быстрый доступ.
        const detail =
          err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'неизвестная ошибка'
        console.error('[demo] auto-login failed:', err)
        setErrorDetail(`${detail}${err?.response?.status ? ` (HTTP ${err.response.status})` : ''}`)
      })
  }, [router, setAuth])

  return (
    <div className="w-full max-w-md text-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {errorDetail ? (
          <div className="text-red-600 text-sm space-y-2">
            <p>Не удалось загрузить демо-стенд. Обновите страницу или сообщите нам об этом.</p>
            <p className="text-xs text-red-400 font-mono break-words">{errorDetail}</p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Загружаем демо…</p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await authApi.login(data.email, data.password)
      setAuth(result.user)
      router.push('/')
    } catch {
      setError('Неверный email или пароль')
    }
  }

  if (DEMO_MODE) return <DemoAutoLogin />

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Вход в CRM</h1>
          <p className="text-gray-500 text-sm mt-1">Онлайн-школа иностранных языков</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="manager@crm.local"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {DEMO_STAND_URL && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            <a
              href={DEMO_STAND_URL}
              className="inline-block text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              🎭 Демо режим — посмотреть без регистрации
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
