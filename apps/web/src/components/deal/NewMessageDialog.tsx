'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Send, Paperclip } from 'lucide-react'
import { dealsApi, integrationsApi, emailAccountsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TRANSPORT_LABELS, TRANSPORT_EMOJI, channelCanInitiate } from '@crm/shared'
import { emailOptions } from '@/lib/channelOptions'

type ContactPhone = { id: string; phone: string; label?: string | null }
type ContactChannel = { id: string; transport: string; chatId: string }
type ContactEmailEntry = { id: string; email: string; label?: string | null }

interface Contact {
  id: string
  name: string
  phone?: string | null
  telegramUsername?: string | null
  phones: ContactPhone[]
  channels: ContactChannel[]
  email?: string | null
  emails?: ContactEmailEntry[]
}

interface Props {
  dealId: string
  contact: Contact
  onClose: () => void
}

type RecipientKind = 'chatId' | 'phone' | 'username'
type RecipientOption = { label: string; value: string; kind: RecipientKind }

// Только Telegram Personal/MAX (tgapi/max) резолвят чат по номеру телефона через отдельное
// поле запроса phone/username — chatId с угаданным значением (голые цифры телефона) WazzUp
// принимает, но реальный чат не создаёт. См. wazzupClient.sendMessage.
function supportsPhoneLookup(transport: string): boolean {
  return transport === 'tgapi' || transport === 'max'
}

function getRecipientOptions(transport: string, contact: Contact): RecipientOption[] {
  const opts: RecipientOption[] = []
  const phoneKind: RecipientKind = supportsPhoneLookup(transport) ? 'phone' : 'chatId'

  // Known chatId from history (most reliable)
  const knownChannel = contact.channels.find(c => c.transport === transport)
  if (knownChannel) {
    opts.push({ label: `${knownChannel.chatId} (из истории)`, value: knownChannel.chatId, kind: 'chatId' })
  }

  if (transport === 'tgapi' || transport === 'telegram') {
    // Telegram username
    if (contact.telegramUsername) {
      const u = contact.telegramUsername.replace(/^@/, '')
      opts.push({ label: `@${u}`, value: u, kind: supportsPhoneLookup(transport) ? 'username' : 'chatId' })
    }
    // Phones (Telegram Personal резолвит чат по номеру)
    if (contact.phone) opts.push({ label: contact.phone, value: contact.phone.replace(/\D/g, ''), kind: phoneKind })
    contact.phones.forEach(p => {
      if (!opts.find(o => o.value === p.phone.replace(/\D/g, '')))
        opts.push({ label: `${p.phone}${p.label ? ` (${p.label})` : ''}`, value: p.phone.replace(/\D/g, ''), kind: phoneKind })
    })
  } else {
    // WhatsApp / MAX — phones only
    if (contact.phone) opts.push({ label: contact.phone, value: contact.phone.replace(/\D/g, ''), kind: phoneKind })
    contact.phones.forEach(p => {
      if (!opts.find(o => o.value === p.phone.replace(/\D/g, '')))
        opts.push({ label: `${p.phone}${p.label ? ` (${p.label})` : ''}`, value: p.phone.replace(/\D/g, ''), kind: phoneKind })
    })
  }

  return opts
}

export function NewMessageDialog({ dealId, contact, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: channelData } = useQuery({
    queryKey: ['integrations', 'wazzup'],
    queryFn: () => integrationsApi.wazzupChannels(),
  })
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => emailAccountsApi.list(),
  })

  // Only active channels that support first-contact (personal WhatsApp/Telegram/MAX, not bots)
  const wazzupTransports = (channelData?.channels ?? [])
    .filter(ch => channelCanInitiate(ch.transport, ch.plainId) && ch.state === 'active')
    .map(ch => ch.transport)

  const emailRecipientOpts = emailOptions(contact)
  const emailAvailable = emailRecipientOpts.length > 0 && emailAccounts.length > 0
  const smsAvailable = Boolean(contact.phone) || contact.phones.length > 0
  const availableTransports = [
    ...wazzupTransports,
    ...(smsAvailable ? ['sms'] : []),
    ...(emailAvailable ? ['email'] : []),
  ]

  const [transport, setTransport] = useState<string>(() => availableTransports[0] ?? 'whatsapp')
  const [chatId, setChatId] = useState<string>('')
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [smsTemplateId, setSmsTemplateId] = useState('')

  const isEmail = transport === 'email'
  const isSms = transport === 'sms'
  const recipientOpts: RecipientOption[] = isEmail
    ? emailRecipientOpts.map(o => ({ label: o.label, value: o.chatId, kind: 'chatId' as const }))
    : getRecipientOptions(transport, contact)

  // Auto-select first recipient when transport changes
  const effectiveChatId = chatId || recipientOpts[0]?.value || ''
  const effectiveRecipientKind = recipientOpts.find(o => o.value === effectiveChatId)?.kind ?? 'chatId'
  const effectiveAccountId = accountId || emailAccounts[0]?.id || ''

  // Шаблоны SMS из TargetSMS — тот же приём, что в MessagesTab (DealDetail.tsx)
  const { data: smsTemplatesData } = useQuery({
    queryKey: ['integrations', 'targetsms', 'templates'],
    queryFn: () => integrationsApi.targetsmsTemplates(),
    enabled: isSms,
    retry: false,
  })
  const smsTemplates = smsTemplatesData?.templates ?? []

  const sendMutation = useMutation({
    mutationFn: () => {
      if (isEmail) {
        const formData = new FormData()
        formData.append('accountId', effectiveAccountId)
        formData.append('to', effectiveChatId)
        formData.append('subject', subject.trim())
        formData.append('body', text.trim())
        files.forEach(f => formData.append('files', f))
        return dealsApi.sendEmail(dealId, formData)
      }
      return dealsApi.sendMessage(dealId, text.trim(), transport, effectiveChatId, undefined, effectiveRecipientKind)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] })
      onClose()
    },
  })

  const canSubmit = isEmail
    ? Boolean(text.trim() && effectiveChatId && subject.trim() && effectiveAccountId)
    : Boolean(text.trim() && effectiveChatId)

  if (availableTransports.length === 0) {
    // stopPropagation обязателен: диалог рендерится внутри оверлея DealModal,
    // без него клик по «Закрыть» всплывает и закрывает всю карточку сделки
    return (
      <div
        className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
        onClick={e => { e.stopPropagation(); onClose() }}
      >
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-gray-600">
            Нет активных каналов для отправки первым — ни WazzUp, ни SMS (нет телефона), ни email
            (проверьте email контакта и почтовые ящики в Настройки → Почта).
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Закрыть</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
      onClick={e => { e.stopPropagation(); onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Написать {contact.name}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Channel selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Канал</label>
          <div className="flex gap-2 flex-wrap">
            {availableTransports.map(t => (
              <button
                key={t}
                onClick={() => { setTransport(t); setChatId('') }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                  transport === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                )}
              >
                <span>{TRANSPORT_EMOJI[t]}</span>
                {TRANSPORT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Отправить из (несколько доступных почтовых ящиков) */}
        {isEmail && emailAccounts.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Отправить из</label>
            <select
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={effectiveAccountId}
              onChange={e => setAccountId(e.target.value)}
            >
              {emailAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.label} ({a.emailAddress})</option>
              ))}
            </select>
          </div>
        )}

        {/* Recipient */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Кому</label>
          {recipientOpts.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
              {isEmail ? 'У контакта нет email. Добавь в карточке контакта.' : 'У контакта нет телефона или @username. Добавь в карточке контакта.'}
            </p>
          ) : (
            <select
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={chatId || recipientOpts[0]?.value}
              onChange={e => setChatId(e.target.value)}
            >
              {recipientOpts.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Тема — только для email */}
        {isEmail && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Тема</label>
            <input
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Тема письма"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
        )}

        {/* SMS — выбор готового шаблона из TargetSMS вместо ручного набора текста */}
        {isSms && smsTemplates.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Шаблон</label>
            <select
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              value={smsTemplateId}
              onChange={e => {
                const id = e.target.value
                setSmsTemplateId(id)
                const tpl = smsTemplates.find(t => t.id === id)
                if (tpl) setText(tpl.text.replaceAll('{имя}', contact.name))
              }}
            >
              <option value="">Свой текст...</option>
              {smsTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Message */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{isEmail ? 'Текст письма' : 'Сообщение'}</label>
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
            placeholder="Введите сообщение..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (!isEmail && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSubmit) sendMutation.mutate() } }}
          />
        </div>

        {/* Вложения — только для email */}
        {isEmail && (
          <div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer w-fit">
              <Paperclip className="h-3.5 w-3.5" />
              <span>{files.length ? `${files.length} файл(ов)` : 'Прикрепить файлы'}</span>
              <input type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
            </label>
          </div>
        )}

        {sendMutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {(sendMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка отправки'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">
            Отмена
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!canSubmit || sendMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {sendMutation.isPending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
