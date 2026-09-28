'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from 'recharts'
import { analyticsApi, pipelinesApi } from '@/lib/api'
import { formatMoney } from '@/lib/utils'

export default function AnalyticsPage() {
  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: pipelinesApi.list,
  })

  const pipelineId = pipelines[0]?.id

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', pipelineId],
    queryFn: () => analyticsApi.pipeline(pipelineId!),
    enabled: !!pipelineId,
  })

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Загрузка аналитики...
      </div>
    )
  }

  const { summary, stages, funnel = [], utmSources = [], byAssignee, monthly, lostReasons = [] } = analytics

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">Аналитика</h1>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI summary */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Всего сделок', value: summary.totalDeals },
            { label: 'Конверсия', value: `${summary.conversionRate}%` },
            { label: 'Сумма', value: formatMoney(summary.totalBudget) },
            {
              label: 'Win rate',
              value: summary.winRate != null ? `${summary.winRate}%` : '—',
            },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Won / lost */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Успешно</p>
            <p className="text-xl font-bold text-green-600">{summary.wonDeals ?? summary.closedDeals}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Потеряно</p>
            <p className="text-xl font-bold text-red-500">{summary.lostDeals ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 col-span-2">
            <p className="text-xs text-gray-500 mb-2">Причины потери</p>
            {lostReasons.length === 0 ? (
              <p className="text-sm text-gray-400">Нет потерянных сделок</p>
            ) : (
              <div className="space-y-1">
                {lostReasons.map((r: { id: string | null; name: string; count: number }) => (
                  <div key={r.id ?? 'none'} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{r.name}</span>
                    <span className="text-gray-400 font-medium">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Пробные уроки */}
        {summary.trials && (
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'Пробных записано', value: summary.trials.booked },
              { label: 'Состоялось', value: summary.trials.completed },
              { label: 'Не пришли', value: summary.trials.noShow },
              {
                label: 'Show-rate',
                value: summary.trials.showRate != null ? `${summary.trials.showRate}%` : '—',
              },
              {
                label: 'Пробный → оплата',
                value: summary.trials.trialToPaymentRate != null ? `${summary.trials.trialToPaymentRate}%` : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Удержание учеников */}
        {summary.retention && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Учеников с оплатой', value: summary.retention.payingContacts },
              { label: 'LTV (ученик)', value: summary.retention.ltv != null ? formatMoney(summary.retention.ltv) : '—' },
              {
                label: 'Renewal rate',
                value: summary.retention.renewalRate != null ? `${summary.retention.renewalRate}%` : '—',
              },
              {
                label: 'Churn',
                value: summary.retention.churnRate != null ? `${summary.retention.churnRate}%` : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stages bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Сделки по этапам</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stages} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) => [
                  name === 'dealsCount' ? `${value} сделок` : formatMoney(Number(value)),
                  name === 'dealsCount' ? 'Количество' : 'Сумма',
                ]}
              />
              <Bar dataKey="dealsCount" fill="#3b82f6" radius={[4, 4, 0, 0]} name="dealsCount" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Funnel: cumulative conversion by stage (current position) */}
        {funnel.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Воронка конверсии</h2>
            <div className="grid grid-cols-2 gap-4 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <FunnelChart>
                  <Tooltip formatter={(value: number) => [`${value} сделок`, 'Дошло']} />
                  <Funnel dataKey="cumulativeCount" data={funnel} nameKey="name" fill="#3b82f6" isAnimationActive={false}>
                    <LabelList position="right" dataKey="name" fill="#374151" stroke="none" fontSize={11} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {funnel.map((f: { id: string; name: string; cumulativeCount: number; conversionFromFirst: number | null; conversionFromPrevious: number | null }, i: number) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{f.name}</span>
                    <span className="text-gray-400">
                      {f.cumulativeCount} сделок
                      {f.conversionFromFirst != null && ` · ${f.conversionFromFirst}%`}
                      {i > 0 && f.conversionFromPrevious != null && ` (${f.conversionFromPrevious}% от пред. этапа)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Источники (UTM) */}
        {utmSources.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Источники</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-medium pb-2">Источник</th>
                  <th className="font-medium pb-2 text-right">Сделок</th>
                  <th className="font-medium pb-2 text-right">Выиграно</th>
                  <th className="font-medium pb-2 text-right">Конверсия</th>
                  <th className="font-medium pb-2 text-right">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {utmSources.map((s: { source: string; count: number; won: number; conversionRate: number | null; revenue: number }) => (
                  <tr key={s.source} className="border-t border-gray-50">
                    <td className="py-1.5 text-gray-700">{s.source}</td>
                    <td className="py-1.5 text-right text-gray-700">{s.count}</td>
                    <td className="py-1.5 text-right text-gray-700">{s.won}</td>
                    <td className="py-1.5 text-right text-gray-400">{s.conversionRate != null ? `${s.conversionRate}%` : '—'}</td>
                    <td className="py-1.5 text-right text-gray-400">{formatMoney(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Monthly chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Динамика по месяцам</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[...monthly].reverse()} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${v} сделок`, 'Количество']} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By assignee */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">По менеджерам</h2>
            <div className="space-y-2">
              {byAssignee.map((a: { assigneeId: string; name: string; count: number; budget: number }) => (
                <div key={a.assigneeId ?? 'unassigned'} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-700 font-medium">{a.name}</span>
                      <span className="text-xs text-gray-400">{a.count} сделок</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min((a.count / (summary.totalDeals || 1)) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
