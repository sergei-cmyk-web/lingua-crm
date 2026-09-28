export interface Company {
  id: string
  name: string
  custom_fields: Record<string, unknown>
  _count?: { contacts: number; deals: number }
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCompanyDto {
  name: string
  custom_fields?: Record<string, unknown>
  force?: boolean
}

export interface UpdateCompanyDto extends Partial<CreateCompanyDto> {}
