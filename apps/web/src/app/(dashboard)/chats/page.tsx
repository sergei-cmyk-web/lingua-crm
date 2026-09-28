'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Loader2, Check, CheckCheck, AlertCircle, Search } from 'lucide-react'
import { TRANSPORT_EMOJI } from '@crm/shared'
import { chatsApi, integrationsApi } from '@/lib/api'
import { channelOptions, messageChannelLabel, type ChannelContact } from '@/lib/channelOptions'
import { getSocket } from '@/lib/socket'
import { cn, formatDateTime } from '@/lib/utils'

const PAGE_SIZE = 30
const UNMATCHED_PREFIX = 'unmatched:'

interface ChatSummary {
  id: string
  contactId: string | null
  contactName: string
  contactPhone: string | null
  lastMessage: { channel: string; direction: string; content: string; createdAt: string; status: string }
  unreadCount: number
}

interface ChatMessage {
  id: string
  channel: string
  channelId?: string | null
  chatId?: string | null
  direction: string
  content: string
  status: string
  errorMsg?: string | null
  createdAt: string
}

interface ChatThreadResponse {
  contact: (ChannelContact & { id: string; name: string }) | null
  messages: ChatMessage[]
}

function MessageStatus({ status }: { status?: string }) {
  if (!status || status === 'sent') return <Check className="h-3 w-3 inline-block ml-1 opacity-60" />
  if (status === 'sending') return <Loader2 className="h-3 w-3 inline-block ml-1 opacity-60 animate-spin" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 inline-block ml-1 opacity-60" />
  if (status === 'read') return <CheckCheck className="h-3 w-3 inline-block ml-1 text-blue-300" />
  if (status === 'error') return <AlertCircle className="h-3 w-3 inline-block ml-1 text-red-300" />
  return null
}

export default function ChatsPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [text, setText] = useState('')
  const [channelKey, setChannelKey] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const isUnmatched = selectedId?.startsWith(UNMATCHED_PREFIX) ?? false

  const { data: chats = [] } = useQuery<ChatSummary[]>({
    queryKey: ['chats', search, limit],
    queryFn: () => chatsApi.list({ search: search || undefined, limit }),
  })
  const { data: thread } = useQuery<ChatThreadResponse>({
    queryKey: ['chat', selectedId],
    queryFn: () => chatsApi.thread(selectedId!),
    enabled: !!selectedId,
  })
  const { data: channelData } = useQuery({
    queryKey: ['integrations', 'wazzup'],
    queryFn: () => integrationsApi.wazzupChannels(),
  })

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [search])

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join:chats-inbox')
    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.invalidateQueries({ queryKey: ['chat'] })
    }
    socket.on('NEW_MESSAGE', invalidateAll)
    socket.on('MESSAGE_STATUS', invalidateAll)
    return () => {
      socket.emit('leave:chats-inbox')
      socket.off('NEW_MESSAGE', invalidateAll)
      socket.off('MESSAGE_STATUS', invalidateAll)
    }
  }, [queryClient])

  useEffect(() => {
    if (!selectedId || isUnmatched) return
    const socket = getSocket()
    socket.emit('join:chat', selectedId)
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['chat', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['chats'] })
    }
    socket.on('NEW_MESSAGE', invalidate)
    socket.on('MESSAGE_STATUS', invalidate)
    return () => {
      socket.emit('leave:chat', selectedId)
      socket.off('NEW_MESSAGE', invalidate)
      socket.off('MESSAGE_STATUS', invalidate)
    }
  }, [selectedId, isUnmatched, queryClient])

  // Открытие чата/новое сообщение — прокрутка ленты к последнему сообщению (снизу)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedId, thread?.messages.length])

  const channels = useMemo(() => (isUnmatched ? [] : channelOptions(thread?.contact ?? undefined)), [thread?.contact, isUnmatched])

  // По умолчанию — транспорт последнего сообщения в треде, иначе первый доступный канал
  useEffect(() => {
    if (!thread || isUnmatched) return
    const lastChannel = thread.messages[thread.messages.length - 1]?.channel
    const fallback = channels.find(c => c.transport === lastChannel)?.key || channels[0]?.key || ''
    setChannelKey(fallback)
  }, [thread, channels, isUnmatched])

  const selectedChannel = channels.find(c => c.key === channelKey)

  const selectChat = (id: string) => {
    setSelectedId(id)
    setText('')
    queryClient.invalidateQueries({ queryKey: ['chats'] })
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      isUnmatched
        ? chatsApi.reply(selectedId!, { text: text.trim() })
        : chatsApi.reply(selectedId!, { transport: selectedChannel!.transport, chatId: selectedChannel!.chatId, text: text.trim() }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['chat', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['chats'] })
    },
  })

  const canSend = isUnmatched ? !!text.trim() : !!text.trim() && !!selectedChannel
  const handleSend = () => {
    if (!canSend || sendMutation.isPending) return
    sendMutation.mutate()
  }

  const noChannels = !!thread && !isUnmatched && channels.length === 0

  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-gray-100 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-100 space-y-2">
          <p className="text-sm font-semibold text-gray-900">Чаты</p>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-gray-400" />
            <input
              className="w-full pl-8 pr-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Поиск по чатам..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8 px-4">Сообщений пока нет</p>
          )}
          {chats.map(c => (
            <button
              key={c.id}
              onClick={() => selectChat(c.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                selectedId === c.id && 'bg-blue-50'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-sm truncate font-medium', c.contactId ? 'text-gray-900' : 'text-gray-500 italic')}>
                  {c.contactName}
                </p>
                {c.unreadCount > 0 && (
                  <span className="text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5 shrink-0">{c.unreadCount}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {TRANSPORT_EMOJI[c.lastMessage.channel] ?? '📱'} {c.lastMessage.direction === 'out' ? 'Вы: ' : ''}
                {c.lastMessage.content || '[вложение]'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(c.lastMessage.createdAt)}</p>
            </button>
          ))}
          {chats.length >= limit && (
            <button
              onClick={() => setLimit(l => l + PAGE_SIZE)}
              className="w-full py-2.5 text-xs text-blue-600 hover:bg-gray-50 border-b border-gray-50"
            >
              Показать ещё
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {selectedId && thread ? (
          <>
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{thread.contact?.name ?? 'Неизвестный контакт'}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {thread.messages.map(msg => {
                const isOut = msg.direction === 'out'
                return (
                  <div key={msg.id} className={cn('flex flex-col', isOut ? 'items-end' : 'items-start')}>
                    <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                      {messageChannelLabel(msg.channel, msg.channelId, msg.chatId, channelData?.channels ?? [])}
                    </span>
                    <div className={cn('max-w-lg px-3 py-2 rounded-lg text-sm', isOut ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900')}>
                      <p className="whitespace-pre-wrap break-words">{msg.content || '[вложение]'}</p>
                      <div className={cn('flex items-center justify-end gap-1 mt-0.5', isOut ? 'text-blue-200' : 'text-gray-400')}>
                        {(msg as { _demo?: boolean })._demo && <span title="Демо: не отправлено реальному получателю">🎭</span>}
                        <span className="text-xs">{formatDateTime(msg.createdAt)}</span>
                        {isOut && <MessageStatus status={msg.status} />}
                      </div>
                    </div>
                    {isOut && msg.status === 'error' && msg.errorMsg && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-lg px-1">{msg.errorMsg}</p>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {noChannels ? (
              <div className="border-t border-gray-100 p-4 text-sm text-gray-500 text-center">
                Нет активных каналов для ответа
              </div>
            ) : (
              <div className="border-t border-gray-100 p-3 space-y-2">
                {!isUnmatched && (
                  <div className="flex gap-1.5 flex-wrap">
                    {channels.map(ch => (
                      <button
                        key={ch.key}
                        onClick={() => setChannelKey(ch.key)}
                        className={cn(
                          'text-xs px-2 py-1 rounded-md border transition-colors',
                          channelKey === ch.key
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        )}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    placeholder="Ответить..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!canSend || sendMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shrink-0"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Отправить
                  </button>
                </div>
                {sendMutation.isError && (
                  <p className="text-xs text-red-600">Ошибка отправки</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Выберите чат слева</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
