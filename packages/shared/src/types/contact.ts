export interface Contact {
  id: string
  name: string
  phone: string | null
  email: string | null
  companyId: string | null
  company?: { id: string; name: string } | null
  custom_fields: Record<string, unknown>
  tags: string[]
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateContactDto {
  name: string
  phone?: string
  email?: string
  telegramUsername?: string
  companyId?: string
  custom_fields?: Record<string, unknown>
  tags?: string[]
  force?: boolean
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}
