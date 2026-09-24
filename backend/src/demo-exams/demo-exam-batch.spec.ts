import { buildDemoScores, checkDemoStudents, DEMO_EXAMS, DEMO_SUBJECTS } from './demo-exam-batch'

const students = [
  { id: 'person-1', eduplusId: 'student:1', eduplusUserId: '901' },
  { id: 'person-2', eduplusId: 'student:2', eduplusUserId: '902' },
]

describe('main09 demonstration exam batch', () => {
  it('creates stable, bounded, improving scores for every student, exam and subject', () => {
    const first = buildDemoScores(students)
    const second = buildDemoScores([...students].reverse())
    expect(first).toHaveLength(students.length * DEMO_EXAMS.length * DEMO_SUBJECTS.length)
    expect(first).toEqual(second)
    expect(new Set(first.map((cell) => `${cell.studentId}:${cell.examKey}:${cell.subjectKey}`)).size).toBe(first.length)
    expect(first.every((cell) => cell.value >= 60 && cell.value <= 98)).toBe(true)
    const firstStudentMath = first.filter((cell) => cell.studentId === 'person-1' && cell.subjectKey === 'math')
    expect(firstStudentMath).toHaveLength(3)
    expect(firstStudentMath.map((cell) => cell.value)).toEqual([
      firstStudentMath[0].value, firstStudentMath[0].value + 5, firstStudentMath[0].value + 10,
    ])
  })

  it('includes students without accounts, but rejects duplicate bound EduPlus user IDs', () => {
    expect(checkDemoStudents([{ ...students[0], eduplusUserId: null }])).toBe(1)
    expect(buildDemoScores([{ ...students[0], eduplusUserId: null }])).toHaveLength(9)
    expect(() => checkDemoStudents([students[0], { ...students[1], eduplusUserId: '901' }])).toThrow('duplicate EduPlus user ID')
    expect(() => checkDemoStudents([])).toThrow('no synchronized students')
    expect(checkDemoStudents(students)).toBe(2)
  })
})
