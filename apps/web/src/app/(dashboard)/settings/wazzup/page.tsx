'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { integrationsApi, type WazzupChannel } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TRANSPORT_LABELS, TRANSPORT_EMOJI, channelCanInitiate as canInitiateTransport } from '@crm/shared'

function channelCanInitiate(channel: WazzupChannel): boolean {
  return canInitiateTransport(channel.transport, channel.plainId)
}

const STATE_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  active:          { label: 'Активен',         color: 'text-green-600 bg-green-50',   icon: CheckCircle },
  init:            { label: 'Инициализация',   color: 'text-yellow-600 bg-yellow-50', icon: AlertCircle },
  disabled:        { label: 'Отключён',        color: 'text-gray-500 bg-gray-100',    icon: XCircle },
  notEnoughMoney:  { label: 'Нет баланса',     color: 'text-red-600 bg-red-50',       icon: XCircle },
  unauthorized:    { label: 'Не авторизован',  color: 'text-red-600 bg-red-50',       icon: XCircle },
  blocked:         { label: 'Заблокирован',    color: 'text-red-600 bg-red-50',       icon: XCircle },
}

function ChannelRow({ channel }: { channel: WazzupChannel }) {
  const state = STATE_CONFIG[channel.state] ?? { label: channel.state, color: 'text-gray-500 bg-gray-100', icon: AlertCircle }
  const StateIcon = state.icon
  const canInitiate = channelCanInitiate(channel)

  return (
    <div className="flex items-center gap-4 px-4 py-3 border border-gray-100 rounded-lg bg-white">
      <span className="text-xl w-8 text-center">
        {TRANSPORT_EMOJI[channel.transport] ?? '📱'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {TRANSPORT_LABELS[channel.transport] ?? channel.transport}
        </p>
        <p className="text-xs text-gray-400 truncate">{channel.plainId}</p>
      </div>
      {channel.state === 'active' && (
        canInitiate
          ? <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">✏️ первый контакт</span>
          : <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">↩ только ответы</span>
      )}
      <span className={cn('flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full', state.color)}>
        <StateIcon className="h-3 w-3" />
        {state.label}
      </span>
    </div>
  )
}

export default function WazzupPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['integrations', 'wazzup'],
    queryFn: () => integrationsApi.wazzupChannels(),
  })

  const syncMutation = useMutation({
    mutationFn: () => integrationsApi.wazzupSync(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations', 'wazzup'] }),
  })

  const channels = data?.channels ?? []
  const activeCount = channels.filter(c => c.state === 'active').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">WazzUp</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Мессенджеры: WhatsApp, Telegram, Instagram и другие
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isLoading && (
              <span className={cn(
                'text-xs font-medium px-2 py-1 rounded-full',
                data?.hasApiKey ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
              )}>
                {data?.hasApiKey ? '🔑 API ключ настроен' : '⚠️ API ключ не настроен'}
              </span>
            )}
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !data?.hasApiKey}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncMutation.isPending && 'animate-spin')} />
              {syncMutation.isPending ? 'Синхронизация...' : 'Синхронизировать каналы'}
            </button>
          </div>
        </div>

        {syncMutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            Ошибка: {(syncMutation.error as Error)?.message ?? 'Не удалось синхронизировать'}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Загрузка...</p>
        ) : channels.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500">Каналы не синхронизированы</p>
            <p className="text-xs text-gray-400 mt-1">
              Нажмите «Синхронизировать каналы» чтобы загрузить подключённые мессенджеры из WazzUp
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              {activeCount} из {channels.length} активных
            </p>
            {channels.map(ch => (
              <ChannelRow key={ch.channelId} channel={ch} />
            ))}
            <p className="text-xs text-gray-400 pt-1">
              Каналы с меткой «первый контакт» поддерживают начало переписки (WhatsApp, Telegram личный, VK MAX личный).
              Боты и reply-only каналы работают только для ответов.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
