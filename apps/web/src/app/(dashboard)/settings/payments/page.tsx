'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { integrationsApi, pipelinesApi } from '@/lib/api'
import { DEFAULT_INVOICE_MESSAGE_TEMPLATE } from '@/lib/invoiceTemplate'
import type { Pipeline } from '@crm/shared'

interface PaymentsConfig {
  defaultProvider?: string
  robokassaTestMode?: boolean
  paidStageMap?: Record<string, string>
  invoiceMessageTemplate?: string
}

export default function PaymentsSettingsPage() {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  // CloudPayments
  const [cpPublicId, setCpPublicId] = useState('')
  const [cpApiSecret, setCpApiSecret] = useState('')
  // Робокасса
  const [rkLogin, setRkLogin] = useState('')
  const [rkPassword1, setRkPassword1] = useState('')
  const [rkPassword2, setRkPassword2] = useState('')
  // Общее
  const [config, setConfig] = useState<PaymentsConfig>({})

  const { data: cpIdSetting } = useQuery({
    queryKey: ['settings', 'cloudpayments_public_id'],
    queryFn: () => integrationsApi.getSetting('cloudpayments_public_id'),
  })
  const { data: cpSecretSetting } = useQuery({
    queryKey: ['settings', 'cloudpayments_api_secret'],
    queryFn: () => integrationsApi.getSetting('cloudpayments_api_secret'),
  })
  const { data: rkLoginSetting } = useQuery({
    queryKey: ['settings', 'robokassa_login'],
    queryFn: () => integrationsApi.getSetting('robokassa_login'),
  })
  const { data: rkP1Setting } = useQuery({
    queryKey: ['settings', 'robokassa_password1'],
    queryFn: () => integrationsApi.getSetting('robokassa_password1'),
  })
  const { data: rkP2Setting } = useQuery({
    queryKey: ['settings', 'robokassa_password2'],
    queryFn: () => integrationsApi.getSetting('robokassa_password2'),
  })
  const { data: configSetting } = useQuery({
    queryKey: ['settings', 'payments'],
    queryFn: () => integrationsApi.getSetting('payments'),
  })
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: pipelinesApi.list,
  })

  useEffect(() => { if (cpIdSetting?.value) setCpPublicId(cpIdSetting.value) }, [cpIdSetting])
  useEffect(() => { if (rkLoginSetting?.value) setRkLogin(rkLoginSetting.value) }, [rkLoginSetting])
  useEffect(() => {
    if (configSetting?.value) {
      try { setConfig(JSON.parse(configSetting.value)) } catch { /* некорректный JSON — оставляем дефолт */ }
    }
  }, [configSetting])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await integrationsApi.putSetting('cloudpayments_public_id', cpPublicId.trim())
      if (cpApiSecret) await integrationsApi.putSetting('cloudpayments_api_secret', cpApiSecret)
      await integrationsApi.putSetting('robokassa_login', rkLogin.trim())
      if (rkPassword1) await integrationsApi.putSetting('robokassa_password1', rkPassword1)
      if (rkPassword2) await integrationsApi.putSetting('robokassa_password2', rkPassword2)
      await integrationsApi.putSetting('payments', JSON.stringify(config))
    },
    onSuccess: () => {
      setSaved(true)
      setCpApiSecret('')
      setRkPassword1('')
      setRkPassword2('')
      setTimeout(() => setSaved(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const setPaidStage = (pipelineId: string, stageId: string) => {
    setConfig(c => ({
      ...c,
      paidStageMap: { ...(c.paidStageMap ?? {}), ...(stageId ? { [pipelineId]: stageId } : {}) },
      ...(stageId ? {} : { paidStageMap: Object.fromEntries(Object.entries(c.paidStageMap ?? {}).filter(([k]) => k !== pipelineId)) }),
    }))
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Приём оплат</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Платёжные ссылки для счетов из карточки сделки. Webhook об оплате создаёт абонемент и переносит сделку в «Оплачено».
          </p>
        </div>

        {/* CloudPayments */}
        <div className="space-y-4 bg-white border border-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700">CloudPayments</h3>
          <div>
            <label className={labelCls}>Public ID</label>
            <input className={inputCls} value={cpPublicId} onChange={e => setCpPublicId(e.target.value)} placeholder="pk_..." />
          </div>
          <div>
            <label className={labelCls}>
              API Secret {cpSecretSetting?.hasValue && <span className="text-green-600">(задан — оставьте пустым, чтобы не менять)</span>}
            </label>
            <input
              type="password" className={inputCls} value={cpApiSecret} onChange={e => setCpApiSecret(e.target.value)}
              placeholder={cpSecretSetting?.hasValue ? '••••••••' : 'API Secret из ЛК CloudPayments'}
            />
          </div>
          <p className="text-xs text-gray-400">
            В ЛК CloudPayments (Сайт → Уведомления) укажите Pay-уведомление: <code className="bg-gray-50 px-1 rounded">{'{API_URL}'}/api/webhooks/payments/cloudpayments</code>
          </p>
        </div>

        {/* Робокасса */}
        <div className="space-y-4 bg-white border border-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700">Робокасса</h3>
          <div>
            <label className={labelCls}>Идентификатор магазина (MerchantLogin)</label>
            <input className={inputCls} value={rkLogin} onChange={e => setRkLogin(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Пароль #1 {rkP1Setting?.hasValue && <span className="text-green-600">(задан)</span>}
              </label>
              <input
                type="password" className={inputCls} value={rkPassword1} onChange={e => setRkPassword1(e.target.value)}
                placeholder={rkP1Setting?.hasValue ? '••••••••' : 'Password #1'}
              />
            </div>
            <div>
              <label className={labelCls}>
                Пароль #2 {rkP2Setting?.hasValue && <span className="text-green-600">(задан)</span>}
              </label>
              <input
                type="password" className={inputCls} value={rkPassword2} onChange={e => setRkPassword2(e.target.value)}
                placeholder={rkP2Setting?.hasValue ? '••••••••' : 'Password #2'}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={config.robokassaTestMode ?? false}
              onChange={e => setConfig(c => ({ ...c, robokassaTestMode: e.target.checked }))}
            />
            Тестовый режим (IsTest=1)
          </label>
          <p className="text-xs text-gray-400">
            В настройках магазина Робокассы укажите Result URL (POST): <code className="bg-gray-50 px-1 rounded">{'{API_URL}'}/api/webhooks/payments/robokassa</code>
          </p>
        </div>

        {/* Общее */}
        <div className="space-y-4 bg-white border border-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700">Общее</h3>
          <div>
            <label className={labelCls}>Провайдер по умолчанию</label>
            <select
              className={inputCls}
              value={config.defaultProvider ?? ''}
              onChange={e => setConfig(c => ({ ...c, defaultProvider: e.target.value || undefined }))}
            >
              <option value="">— не выбран —</option>
              <option value="cloudpayments">CloudPayments</option>
              <option value="robokassa">Робокасса</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Этап после оплаты (по воронкам)</label>
            <p className="text-xs text-gray-400 mb-2">Не выбран — сделка переносится в первый этап типа «Успешно».</p>
            <div className="space-y-2">
              {pipelines.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-40 truncate shrink-0">{p.name}</span>
                  <select
                    className={inputCls}
                    value={config.paidStageMap?.[p.id] ?? ''}
                    onChange={e => setPaidStage(p.id, e.target.value)}
                  >
                    <option value="">— первый этап «Успешно» —</option>
                    {p.stages.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.type === 'won' ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Шаблон сообщения со ссылкой на оплату</label>
            <p className="text-xs text-gray-400 mb-2">
              Подставляется по умолчанию при отправке счёта клиенту (можно отредактировать перед отправкой). Плейсхолдеры: <code className="bg-gray-50 px-1 rounded">{'{имя}'}</code> <code className="bg-gray-50 px-1 rounded">{'{пакет}'}</code> <code className="bg-gray-50 px-1 rounded">{'{сумма}'}</code> <code className="bg-gray-50 px-1 rounded">{'{ссылка}'}</code>
            </p>
            <textarea
              className={inputCls}
              rows={3}
              placeholder={DEFAULT_INVOICE_MESSAGE_TEMPLATE}
              value={config.invoiceMessageTemplate ?? ''}
              onChange={e => setConfig(c => ({ ...c, invoiceMessageTemplate: e.target.value || undefined }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> Сохранено
            </span>
          )}
          {saveMutation.isError && (
            <span className="text-sm text-red-600">Ошибка сохранения — нужны права администратора</span>
          )}
        </div>
      </div>
    </div>
  )
}
