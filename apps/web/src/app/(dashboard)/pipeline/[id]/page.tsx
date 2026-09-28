'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { pipelinesApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Pipeline } from '@crm/shared'

export default function PipelinePage() {
  const { id } = useParams<{ id: string }>()
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: pipelinesApi.list,
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {pipelines.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {pipelines.map(p => (
            <Link
              key={p.id}
              href={`/pipeline/${p.id}`}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors shrink-0',
                p.id === id
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard pipelineId={id} />
      </div>
    </div>
  )
}
