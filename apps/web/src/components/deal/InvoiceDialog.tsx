'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Copy, Send, Check } from 'lucide-react'
import { paymentsApi, packagesApi, dealsApi, integrationsApi, contactsApi } from '@/lib/api'
import { formatMoney } from '@/lib/utils'
import { channelOptions } from '@/lib/channelOptions'
import { DEFAULT_INVOICE_MESSAGE_TEMPLATE, renderInvoiceTemplate } from '@/lib/invoiceTemplate'
import type { Package, Payment } from '@crm/shared'

interface Props {
  dealId: string
  contactId?: string
  onClose: () => void
  onCreated: () => void
}

const PROVIDER_LABELS: Record<string, string> = {
  cloudpayments: 'CloudPayments',
  robokassa: 'Робокасса',
}

export default function InvoiceDialog({ dealId, contactId, onClose, onCreated }: Props) {
  const [packageId, setPackageId] = useState('')
  const [amount, setAmount] = useState('')
  const [lessonsTotal, setLessonsTotal] = useState('')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Payment | null>(null)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [channelKey, setChannelKey] = useState('')
  const [messageText, setMessageText] = useState('')

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ['packages', 'active'],
    queryFn: () => packagesApi.list({ active: true }),
  })

  const { data: contact } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => contactsApi.get(contactId!),
    enabled: !!contactId,
  })

  const { data: paymentsSetting } = useQuery({
    queryKey: ['settings', 'payments'],
    queryFn: () => integrationsApi.getSetting('payments'),
  })
  const paymentsConfig: { defaultProvider?: string; invoiceMessageTemplate?: string } = (() => {
    try {
      return paymentsSetting?.value ? JSON.parse(paymentsSetting.value) : {}
    } catch {
      return {}
    }
  })()
  const defaultProvider = paymentsConfig.defaultProvider ?? ''

  const options = channelOptions(contact)

  // Префилл канала и текста сообщения по шаблону — один раз, сразу после выставления счёта
  useEffect(() => {
    if (!created) return
    setChannelKey(options[0]?.key ?? '')
    setMessageText(
      renderInvoiceTemplate(paymentsConfig.invoiceMessageTemplate || DEFAULT_INVOICE_MESSAGE_TEMPLATE, {
        имя: contact?.name ?? '',
        пакет: created.packageName,
        сумма: formatMoney(Number(created.amount)),
        ссылка: created.paymentUrl ?? '',
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created])

  const selectPackage = (id: string) => {
    setPackageId(id)
    const pkg = packages.find(p => p.id === id)
    if (pkg) {
      // Префилл из пакета — поля редактируемые (ручная корректировка)
      setAmount(String(Number(pkg.price)))
      setLessonsTotal(String(pkg.lessonsCount))
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      paymentsApi.create({
        dealId,
        packageId,
        provider: provider || defaultProvider || undefined,
        amount: amount ? Number(amount) : undefined,
        lessonsTotal: lessonsTotal ? Number(lessonsTotal) : undefined,
      }),
    onSuccess: (payment: Payment) => {
      setError(null)
      setCreated(payment)
      onCreated()
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string; error?: string } } }
      setError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Ошибка создания счёта')
    },
  })

  const selectedChannel = options.find(o => o.key === channelKey)

  const sendMutation = useMutation({
    mutationFn: () =>
      dealsApi.sendMessage(dealId, messageText.trim(), selectedChannel?.transport, selectedChannel?.chatId),
    onSuccess: () => setSent(true),
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string; error?: string } } }
      setError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Не удалось отправить сообщение')
    },
  })

  const copyLink = async () => {
    if (!created?.paymentUrl) return
    await navigator.clipboard.writeText(created.paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {created ? 'Счёт выставлен' : 'Выставить счёт'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium">
                {created.packageName} · {formatMoney(Number(created.amount))}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {PROVIDER_LABELS[created.provider] ?? created.provider} · счёт №{created.invoiceId}
              </p>
            </div>
            <input
              readOnly
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
              value={created.paymentUrl ?? ''}
              onFocus={e => e.target.select()}
            />
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Скопировано' : 'Копировать ссылку'}
            </button>

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-gray-500">Отправить клиенту</p>
              {options.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md">
                  {contactId ? 'У контакта нет телефона и каналов — добавьте телефон в карточке контакта' : 'К сделке не привязан контакт'}
                </p>
              ) : (
                <>
                  <div className="flex gap-1.5 flex-wrap">
                    {options.map(o => (
                      <button
                        key={o.key}
                        onClick={() => setChannelKey(o.key)}
                        className={
                          'text-xs px-2 py-1 rounded-md border transition-colors ' +
                          (channelKey === o.key
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300')
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={4}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                  />
                  <button
                    onClick={() => sendMutation.mutate()}
                    disabled={sent || sendMutation.isPending || !messageText.trim() || !selectedChannel}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sent ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    {sent ? 'Отправлено' : 'Отправить'}
                  </button>
                </>
              )}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Пакет</label>
              <select
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={packageId}
                onChange={e => selectPackage(e.target.value)}
              >
                <option value="">— выберите пакет —</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.lessonsCount} ур.{p.lessonDurationMinutes != null ? ` по ${p.lessonDurationMinutes} мин` : ''} · {formatMoney(Number(p.price))}
                  </option>
                ))}
              </select>
            </div>

            {packageId && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Сумма, ₽</label>
                  <input
                    type="number" min="1"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Уроков</label>
                  <input
                    type="number" min="1"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={lessonsTotal}
                    onChange={e => setLessonsTotal(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Провайдер</label>
              <select
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={provider || defaultProvider}
                onChange={e => setProvider(e.target.value)}
              >
                <option value="cloudpayments">CloudPayments</option>
                <option value="robokassa">Робокасса</option>
              </select>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 px-2.5 py-1.5 rounded-md">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Отмена
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!packageId || !amount || createMutation.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Создание…' : 'Создать ссылку'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
