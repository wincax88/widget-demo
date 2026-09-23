import { request } from '../services/api'

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN'
export interface ExamSubject { id: string; courseId: string; maximumScore: number; course: { name: string } }
export interface Exam { id: string; title: string; type: string; status: ExamStatus; classroomId: string; examDate: string; subjects: ExamSubject[] }
export interface ExamOptions { classrooms: Array<{ id: string; name: string; courses: Array<{ id: string; name: string }>; students: Array<{ eduplusId: string; name: string }> }> }

export const examApi = {
  options: () => request<ExamOptions>('/exams/options'),
  list: () => request<Exam[]>('/exams'),
  detail: (id: string) => request<Exam>(`/exams/${id}`),
  create: (data: unknown) => request<Exam>('/exams', { method: 'POST', body: JSON.stringify(data) }),
  saveScores: (id: string, cells: unknown[]) => request<{ saved: number }>(`/exams/${id}/scores`, { method: 'POST', body: JSON.stringify({ cells }) }),
  importScores: (id: string, filename: string, csv: string) => request<{ status: string; errors: Array<{ rowNumber: number; code: string; message: string }> }>(`/exams/${id}/imports`, { method: 'POST', body: JSON.stringify({ filename, csv }) }),
  publish: (id: string) => request<Exam>(`/exams/${id}/publish`, { method: 'POST' }),
  withdraw: (id: string) => request<Exam>(`/exams/${id}/withdraw`, { method: 'POST' }),
}
