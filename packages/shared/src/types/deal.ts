import type { Contact } from './contact'
import type { Company } from './company'
import type { Task } from './task'

export interface Deal {
  id: string
  title: string
  budget: number | null
  stageId: string
  pipelineId: string
  assigneeId: string | null
  contactId: string | null
  companyId: string | null
  custom_fields: Record<string, unknown>
  tags: string[]
  lostReasonId?: string | null
  lostComment?: string | null
  closedAt?: string | null
  deletedAt?: string | null
  stage?: { id: string; name: string; color: string; order: number; type: string }
  assignee?: { id: string; name: string; email: string } | null
  contact?: Contact | null
  company?: Company | null
  lostReason?: { id: string; name: string } | null
  tasks?: Task[]
  _count?: { tasks: number; messages: number; calls: number }
  createdAt: string
  updatedAt: string
}

export interface CreateDealDto {
  title: string
  budget?: number
  stageId: string
  pipelineId: string
  assigneeId?: string
  contactId?: string
  companyId?: string
  custom_fields?: Record<string, unknown>
  tags?: string[]
}

export interface UpdateDealDto extends Partial<CreateDealDto> {}

export interface MoveDealDto {
  stageId: string
  order?: number
  lostReasonId?: string
  lostComment?: string
}
