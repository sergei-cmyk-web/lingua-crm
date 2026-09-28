export type TaskPriority = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  completed: boolean
  result: string | null
  priority: TaskPriority
  dealId: string | null
  contactId: string | null
  companyId: string | null
  assigneeId: string
  assignee?: { id: string; name: string; email: string }
  deal?: { id: string; title: string } | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskDto {
  title: string
  description?: string
  dueDate?: string
  priority?: TaskPriority
  dealId?: string
  contactId?: string
  companyId?: string
  assigneeId: string
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {
  completed?: boolean
  result?: string
}
