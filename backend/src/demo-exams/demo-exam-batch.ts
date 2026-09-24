export interface DemoStudent {
  id: string
  eduplusId: string
  eduplusUserId: string | null
}

export interface DemoScoreCell {
  studentId: string
  examKey: string
  subjectKey: string
  value: number
}

export const DEMO_EXAMS = [
  { key: 'weekly', title: '【演示】周测', type: 'weekly', date: '2026-08-20T00:00:00.000Z' },
  { key: 'monthly', title: '【演示】月考', type: 'monthly', date: '2026-09-05T00:00:00.000Z' },
  { key: 'midterm', title: '【演示】阶段考试', type: 'midterm', date: '2026-09-20T00:00:00.000Z' },
] as const
export const DEMO_SUBJECTS = [
  { key: 'chinese', name: '【演示】语文' },
  { key: 'math', name: '【演示】数学' },
  { key: 'english', name: '【演示】英语' },
] as const

export function checkDemoStudents(students: DemoStudent[]): number {
  if (students.length === 0) throw new Error('no synchronized students')
  const userIds = new Set<string>()
  for (const student of students) {
    const userId = student.eduplusUserId?.trim()
    if (!userId) continue
    if (userIds.has(userId)) throw new Error('duplicate EduPlus user ID')
    userIds.add(userId)
  }
  return students.length
}

export function buildDemoScores(students: DemoStudent[]): DemoScoreCell[] {
  checkDemoStudents(students)
  return [...students].sort((a, b) => a.eduplusId.localeCompare(b.eduplusId)).flatMap((student) =>
    DEMO_EXAMS.flatMap((exam, examIndex) => DEMO_SUBJECTS.map((subject) => {
      const digest = createHash('sha256').update(`${student.eduplusId}:${subject.key}`).digest()
      return {
        studentId: student.id,
        examKey: exam.key,
        subjectKey: subject.key,
        value: 65 + digest[0] % 24 + examIndex * 5,
      }
    })),
  )
}
import { createHash } from 'node:crypto'
