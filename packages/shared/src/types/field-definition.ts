export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'checkbox' | 'textarea'
export type EntityType = 'deal' | 'contact' | 'company'

export interface FieldOption {
  value: string
  label: string
  color?: string
}

export interface FieldDefinition {
  id: string
  entityType: EntityType
  key: string
  label: string
  fieldType: FieldType
  options?: FieldOption[]
  order: number
  required: boolean
  requiredAtStageIds: string[]
  pipelineId: string | null
  createdAt: string
  updatedAt: string
}
