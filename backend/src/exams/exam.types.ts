import { PersonType } from '@prisma/client'

export type ActorContext = {
  tenantId: string
  personId: string
  identityType: PersonType
}

export type ScoreCell = {
  studentEduplusId: string
  subjectId: string
  score: number | null
  absent: boolean
}
