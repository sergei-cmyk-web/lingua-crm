export type StageType = 'open' | 'won' | 'lost'

export interface Stage {
  id: string
  name: string
  color: string
  order: number
  type: StageType
  pipelineId: string
  _count?: { deals: number }
}

export interface Pipeline {
  id: string
  name: string
  stages: Stage[]
  _count?: { deals: number }
  createdAt: string
  updatedAt: string
}

export interface CreateStageDto {
  name: string
  color: string
  order: number
  type?: StageType
}

export interface CreatePipelineDto {
  name: string
  stages?: CreateStageDto[]
}

export interface LostReason {
  id: string
  name: string
  order: number
  active: boolean
  _count?: { deals: number }
}
