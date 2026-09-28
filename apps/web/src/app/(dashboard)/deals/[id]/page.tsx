'use client'

import { useParams, useRouter } from 'next/navigation'
import { DealDetail } from '@/components/deal/DealDetail'

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return <DealDetail dealId={id} onClose={() => router.push('/deals')} onUpdated={() => {}} />
}
