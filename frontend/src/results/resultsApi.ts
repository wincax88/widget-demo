import { request } from '../services/api'

export interface SubjectResult {
  id: string
  name: string
  maximumScore: number
  score: number | null
  absent: boolean
  rank: number | null
}

export interface ExamResult {
  examId: string
  title: string
  isDemo?: boolean
  type: string
  examDate: string
  total: number
  average: number
  classRank: number | null
  subjects: SubjectResult[]
}

export interface AuthorizedChild {
  id: string
  eduplusId: string
  name: string
}

export const resultsApi = {
  mine: () => request<ExamResult[]>('/results/me'),
  children: () => request<AuthorizedChild[]>('/results/children'),
  child: (studentId: string) => request<ExamResult[]>(`/results/children/${encodeURIComponent(studentId)}`),
}

export function formatDateOnly(value: string) {
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').join('/') : value
}
