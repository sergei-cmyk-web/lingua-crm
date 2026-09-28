'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Paperclip, Send, Loader2, Plus, X } from 'lucide-react'
import { emailApi, emailAccountsApi, type EmailAccountSummary } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { cn, formatDateTime } from '@/lib/utils'

interface EmailAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

interface EmailMessage {
  id: string
  dealId: string | null
  contactId: string | null
  direction: string
  content: string
  subject: string | null
  status: string
  errorMsg?: string | null
  toAddresses: string[]
  createdAt: string
  threadKey: string | null
  attachments?: EmailAttachment[]
}

interface EmailThread extends EmailMessage {
  unread: number
}

function AttachmentLink({ attachment }: { attachment: EmailAttachment }) {
  const openMutation = useMutation({
    mutationFn: () => emailApi.attachmentUrl(attachment.id),
    onSuccess: ({ url }) => window.open(url, '_blank'),
  })
  return (
    <button
      onClick={() => openMutation.mutate()}
      disabled={openMutation.isPending}
      className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
    >
      <Paperclip className="h-3 w-3" />
      {attachment.filename}
    </button>
  )
}

function ComposeForm({ accounts, onSent, onCancel }: { accounts: EmailAccountSummary[]; onSent: () => void; onCancel: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const sendMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData()
      formData.append('accountId', accountId)
      formData.append('to', to.trim())
      formData.append('subject', subject.trim())
      formData.append('body', body)
      files.forEach(f => formData.append('files', f))
      return emailApi.compose(formData)
    },
    onSuccess: () => onSent(),
  })

  const valid = accountId && to.trim() && subject.trim()

  return (
    <div className="p-4 border-b border-gray-100 bg-blue-50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Новое письмо</p>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
      </div>
      {accounts.length > 1 && (
        <select
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.emailAddress})</option>)}
        </select>
      )}
      <input
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Кому (email)"
        value={to}
        onChange={e => setTo(e.target.value)}
      />
      <input
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Тема"
        value={subject}
        onChange={e => setSubject(e.target.value)}
      />
      <textarea
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        rows={4}
        placeholder="Текст письма..."
        value={body}
        onChange={e => setBody(e.target.value)}
      />
      <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} className="text-xs" />
      {sendMutation.isError && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {(sendMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка отправки'}
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => sendMutation.mutate()}
          disabled={!valid || sendMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Отправить
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE = 30

export default function EmailInboxPage() {
  const queryClient = useQueryClient()
  const [selectedThread, setSelectedThread] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [showCompose, setShowCompose] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: threads = [] } = useQuery<EmailThread[]>({
    queryKey: ['email-threads', search, limit],
    queryFn: () => emailApi.threads({ search: search || undefined, limit }),
  })

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [search])
  const { data: accounts = [] } = useQuery<EmailAccountSummary[]>({
    queryKey: ['email-accounts'],
    queryFn: () => emailAccountsApi.list(),
  })
  const { data: messages = [] } = useQuery<EmailMessage[]>({
    queryKey: ['email-thread', selectedThread],
    queryFn: () => emailApi.thread(selectedThread!),
    enabled: !!selectedThread,
  })

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join:email')
    const onNewEmail = () => {
      queryClient.invalidateQueries({ queryKey: ['email-threads'] })
      queryClient.invalidateQueries({ queryKey: ['email-thread'] })
    }
    socket.on('NEW_EMAIL', onNewEmail)
    socket.on('MESSAGE_STATUS', onNewEmail)
    return () => {
      socket.emit('leave:email')
      socket.off('NEW_EMAIL', onNewEmail)
      socket.off('MESSAGE_STATUS', onNewEmail)
    }
  }, [queryClient])

  // Открытие треда/новое письмо — прокрутка ленты к последнему сообщению (снизу)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedThread, messages.length])

  const selectThread = (threadKey: string) => {
    setSelectedThread(threadKey)
    queryClient.invalidateQueries({ queryKey: ['email-threads'] })
  }

  const noAccounts = accounts.length === 0

  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-gray-100 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <input
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Поиск по письмам..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={() => setShowCompose(true)}
            disabled={noAccounts}
            title={noAccounts ? 'Нет доступных почтовых ящиков' : 'Написать'}
            className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8 px-4">
              {noAccounts ? 'Нет доступных почтовых ящиков. Обратитесь к администратору.' : 'Писем пока нет'}
            </p>
          )}
          {threads.map(t => (
            <button
              key={t.threadKey}
              onClick={() => selectThread(t.threadKey!)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                selectedThread === t.threadKey && 'bg-blue-50'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-900 truncate font-medium">{t.subject || '(без темы)'}</p>
                {t.unread > 0 && (
                  <span className="text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5 shrink-0">{t.unread}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{t.content}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(t.createdAt)}</p>
            </button>
          ))}
          {threads.length >= limit && (
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
        {showCompose ? (
          <ComposeForm
            accounts={accounts}
            onCancel={() => setShowCompose(false)}
            onSent={() => { setShowCompose(false); queryClient.invalidateQueries({ queryKey: ['email-threads'] }) }}
          />
        ) : null}

        {selectedThread ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={cn('flex flex-col', m.direction === 'out' ? 'items-end' : 'items-start')}>
                <div className={cn('max-w-lg px-3 py-2 rounded-lg text-sm', m.direction === 'out' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900')}>
                  {m.subject && <p className="font-semibold mb-1">{m.subject}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  {!!m.attachments?.length && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map(a => <AttachmentLink key={a.id} attachment={a} />)}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 px-1 flex items-center gap-1">
                  {(m as { _demo?: boolean })._demo && <span title="Демо: письмо не отправлено реальному получателю">🎭</span>}
                  {formatDateTime(m.createdAt)}
                </p>
                {m.direction === 'out' && m.status === 'error' && m.errorMsg && (
                  <p className="text-xs text-red-500 px-1">{m.errorMsg}</p>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        ) : !showCompose ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Mail className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Выберите переписку слева</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
