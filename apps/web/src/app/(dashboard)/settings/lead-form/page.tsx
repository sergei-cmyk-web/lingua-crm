'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, RefreshCw, Copy } from 'lucide-react'
import { integrationsApi, pipelinesApi } from '@/lib/api'

type PipelineOption = { id: string; name: string; stages: { id: string; name: string }[] }

function generateSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function LeadFormSettingsPage() {
  const queryClient = useQueryClient()
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data: pipelines = [] } = useQuery<PipelineOption[]>({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.list(),
  })

  const { data: setting, isLoading } = useQuery({
    queryKey: ['settings', 'lead_form'],
    queryFn: () => integrationsApi.getSetting('lead_form'),
  })

  useEffect(() => {
    if (loaded || isLoading) return
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value)
        if (parsed.pipelineId) setPipelineId(parsed.pipelineId)
        if (parsed.stageId) setStageId(parsed.stageId)
        if (parsed.secret) setSecret(parsed.secret)
      } catch {
        // повреждённая настройка
      }
    }
    setLoaded(true)
  }, [setting, isLoading, loaded])

  const selectedPipeline = pipelines.find(p => p.id === pipelineId)

  const saveMutation = useMutation({
    mutationFn: () =>
      integrationsApi.putSetting('lead_form', JSON.stringify({ secret, pipelineId, stageId })),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['settings', 'lead_form'] })
    },
  })

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const curlExample = `curl -X POST ${apiUrl}/api/leads \\
  -H 'Content-Type: application/json' \\
  -H 'X-Form-Key: ${secret || '<ключ>'}' \\
  -d '{
    "name": "Имя клиента",
    "phone": "+7 999 123-45-67",
    "email": "client@example.com",
    "language": "Английский",
    "comment": "Хочу на пробный урок",
    "utm_source": "vk",
    "utm_campaign": "summer2026"
  }'`

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Форма захвата лидов</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Публичный API-endpoint для форм на сайте: заявка создаёт контакт и сделку с UTM-метками.
            Автоответ клиенту настраивается автоматизацией «Сделка вошла в этап».
          </p>
        </div>

        <div className="space-y-4 bg-white border border-gray-100 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Воронка</label>
              <select
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={pipelineId}
                onChange={e => { setPipelineId(e.target.value); setStageId('') }}
              >
                <option value="">— выберите —</option>
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Этап для новых заявок</label>
              <select
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={stageId}
                onChange={e => setStageId(e.target.value)}
                disabled={!selectedPipeline}
              >
                <option value="">— выберите —</option>
                {selectedPipeline?.stages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Секретный ключ формы</label>
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 font-mono"
                value={secret}
                placeholder="Сгенерируйте ключ"
              />
              <button
                onClick={() => setSecret(generateSecret())}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 hover:border-gray-300"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {secret ? 'Перегенерировать' : 'Сгенерировать'}
              </button>
            </div>
            {secret && setting?.value && JSON.parse(setting.value || '{}').secret !== secret && (
              <p className="text-xs text-amber-600 mt-1">
                Ключ изменён — после сохранения обновите его в форме на сайте
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!pipelineId || !stageId || !secret || saveMutation.isPending}
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
              <span className="text-sm text-red-600">Ошибка — нужны права администратора</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Пример запроса</h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(curlExample)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Copy className="h-3 w-3" /> {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto whitespace-pre">
            {curlExample}
          </pre>
          <p className="text-xs text-gray-400">
            Обязательные поля: name, phone. Ключ можно передавать заголовком X-Form-Key или полем form_key.
            UTM-метки и комментарий сохраняются в дополнительные поля сделки. Лимит: 30 запросов в минуту с одного IP.
            Поле <code>website</code> зарезервировано под honeypot от ботов — не добавляйте видимое поле
            с таким именем; если в HTML-форме есть скрытое поле-ловушка, назовите его так.
          </p>
        </div>
      </div>
    </div>
  )
}
