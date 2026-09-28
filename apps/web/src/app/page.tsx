'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

export default function IndexPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)

  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: pipelinesApi.list,
    enabled: !!user,
  })

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    if (pipelines?.length) router.push(`/pipeline/${pipelines[0].id}`)
  }, [user, pipelines, router])

  return (
    <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
      Загрузка...
    </div>
  )
}
