export interface Package {
  id: string
  name: string
  lessonsCount: number
  /** Длительность одного урока, мин (напр. 45/60); null = не указана */
  lessonDurationMinutes: number | null
  durationDays: number | null
  price: string | number
  active: boolean
  _count?: { subscriptions: number }
  createdAt: string
  updatedAt: string
}

export type SubscriptionStatus = 'active' | 'exhausted' | 'expired' | 'canceled'
export type LessonStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show'

export interface Lesson {
  id: string
  subscriptionId: string
  teacherId: string | null
  teacher?: { id: string; name: string } | null
  scheduledAt: string
  status: LessonStatus
  note: string | null
  createdAt: string
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'canceled'
export type PaymentProviderName = 'cloudpayments' | 'robokassa'

export interface Payment {
  id: string
  invoiceId: number
  dealId: string | null
  contactId: string | null
  packageId: string | null
  packageName: string
  lessonsTotal: number
  durationDays: number | null
  amount: string | number
  currency: string
  provider: PaymentProviderName
  status: PaymentStatus
  paymentUrl: string | null
  paidAt: string | null
  createdAt: string
}

export interface Subscription {
  id: string
  contactId: string
  dealId: string | null
  packageId: string | null
  package?: { id: string; name: string } | null
  packageName: string
  lessonsTotal: number
  lessonsUsed: number
  /** Вычисляется сервером: lessonsTotal - lessonsUsed */
  balance: number
  price: string | number
  status: SubscriptionStatus
  /** status с учётом лениво вычисляемого истечения срока */
  effectiveStatus: SubscriptionStatus
  startsAt: string
  expiresAt: string | null
  lessons: Lesson[]
  createdAt: string
}
