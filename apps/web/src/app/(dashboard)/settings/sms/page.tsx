'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2 } from 'lucide-react'
import { integrationsApi } from '@/lib/api'

export default function SmsSettingsPage() {
  const queryClient = useQueryClient()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [sender, setSender] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: loginSetting } = useQuery({
    queryKey: ['settings', 'targetsms_login'],
    queryFn: () => integrationsApi.getSetting('targetsms_login'),
  })
  const { data: passwordSetting } = useQuery({
    queryKey: ['settings', 'targetsms_password'],
    queryFn: () => integrationsApi.getSetting('targetsms_password'),
  })
  const { data: senderSetting } = useQuery({
    queryKey: ['settings', 'targetsms_sender'],
    queryFn: () => integrationsApi.getSetting('targetsms_sender'),
  })

  useEffect(() => { if (loginSetting?.value) setLogin(loginSetting.value) }, [loginSetting])
  useEffect(() => { if (senderSetting?.value) setSender(senderSetting.value) }, [senderSetting])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await integrationsApi.putSetting('targetsms_login', login.trim())
      if (password) await integrationsApi.putSetting('targetsms_password', password)
      await integrationsApi.putSetting('targetsms_sender', sender.trim())
    },
    onSuccess: () => {
      setSaved(true)
      setPassword('')
      setTimeout(() => setSaved(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => integrationsApi.targetsmsTest(),
  })

  const hasPassword = passwordSetting?.hasValue

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">TargetSMS (СМС Таргет)</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            SMS-канал для напоминаний о пробных уроках и рассылок. Аккаунт — на targetsms.ru
          </p>
        </div>

        <div className="space-y-4 bg-white border border-gray-100 rounded-lg p-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Логин</label>
            <input
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="Логин API TargetSMS"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Пароль {hasPassword && <span className="text-green-600">(задан — оставьте пустым, чтобы не менять)</span>}
            </label>
            <input
              type="password"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={hasPassword ? '••••••••' : 'Пароль API'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Имя отправителя</label>
            <input
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={sender}
              onChange={e => setSender(e.target.value)}
              placeholder="Согласованное имя отправителя (до 11 символов)"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!login.trim() || !sender.trim() || saveMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-md text-gray-700 hover:border-gray-300 disabled:opacity-50"
            >
              {testMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Проверить подключение
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" /> Сохранено
              </span>
            )}
          </div>

          {testMutation.isSuccess && testMutation.data?.balance && (
            <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md">
              Подключение работает. Баланс: {testMutation.data.balance.value} {testMutation.data.balance.currency}
            </p>
          )}
          {testMutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {((testMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error) ??
                'Не удалось проверить подключение'}
            </p>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              Ошибка сохранения — нужны права администратора
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
