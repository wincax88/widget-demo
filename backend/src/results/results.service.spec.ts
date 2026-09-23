import { ForbiddenException } from '@nestjs/common'
import { ExamStatus, PersonType, PrismaClient } from '@prisma/client'
import { ResultsService } from './results.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('ResultsService role-scoped visibility', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const runId = crypto.randomUUID()
  let tenantId: string
  let teacherId: string
  let targetId: string
  let otherStudentId: string
  let parentId: string
  let inactiveParentId: string
  let service: ResultsService

  beforeAll(async () => {
    await prisma.$connect()
    tenantId = (await prisma.tenant.create({ data: { code: `results-${runId}`, name: 'Results School' } })).id
    const people = await Promise.all([
      prisma.person.create({ data: { tenantId, eduplusId: 'teacher', type: PersonType.TEACHER, name: 'Teacher' } }),
      ...['target', 'student-2', 'student-3', 'student-4'].map((id) => prisma.person.create({ data: { tenantId, eduplusId: id, type: PersonType.STUDENT, name: id } })),
      prisma.person.create({ data: { tenantId, eduplusId: 'parent', type: PersonType.PARENT, name: 'Parent' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'inactive-parent', type: PersonType.PARENT, name: 'Inactive Parent' } }),
    ])
    teacherId = people[0].id
    targetId = people[1].id
    otherStudentId = people[2].id
    parentId = people[5].id
    inactiveParentId = people[6].id
    const classroom = await prisma.classroom.create({ data: { tenantId, eduplusId: 'class', name: 'Class' } })
    const course = await prisma.course.create({ data: { tenantId, eduplusId: 'math', name: 'Math' } })
    await prisma.teachingAssignment.create({ data: {
      tenantId, eduplusId: 'assigned-math', teacherId, classroomId: classroom.id,
      courseId: course.id, active: true,
    } })
    await prisma.parentStudentRelation.createMany({ data: [
      { tenantId, eduplusId: 'active-link', parentId, studentId: targetId, active: true },
      { tenantId, eduplusId: 'inactive-link', parentId: inactiveParentId, studentId: targetId, active: false },
    ] })
    for (const [index, status] of [ExamStatus.PUBLISHED, ExamStatus.PUBLISHED, ExamStatus.DRAFT, ExamStatus.WITHDRAWN].entries()) {
      const exam = await prisma.exam.create({ data: { tenantId, creatorId: teacherId, classroomId: classroom.id, title: `Exam ${index}`, type: 'test', examDate: new Date(`2026-0${index + 1}-01`), status } })
      const subject = await prisma.examSubject.create({ data: { tenantId, examId: exam.id, courseId: course.id, maximumScore: 100 } })
      const values = index === 0 ? [90, 100, 90, 80] : [80, 95, 85, 70]
      await prisma.score.createMany({ data: people.slice(1, 5).map((student, studentIndex) => ({ tenantId, examId: exam.id, subjectId: subject.id, studentId: student.id, graderId: teacherId, value: values[studentIndex] })) })
    }
    const otherClass = await prisma.classroom.create({ data: { tenantId, eduplusId: 'other-class', name: 'Other Class' } })
    const otherCourse = await prisma.course.create({ data: { tenantId, eduplusId: 'science', name: 'Science' } })
    const unauthorizedExam = await prisma.exam.create({ data: {
      tenantId, creatorId: teacherId, classroomId: otherClass.id, title: 'Other Exam', type: 'test',
      examDate: new Date('2026-03-01'), status: ExamStatus.PUBLISHED,
    } })
    const unauthorizedSubject = await prisma.examSubject.create({ data: {
      tenantId, examId: unauthorizedExam.id, courseId: otherCourse.id, maximumScore: 100,
    } })
    await prisma.score.create({ data: {
      tenantId, examId: unauthorizedExam.id, subjectId: unauthorizedSubject.id,
      studentId: people[3].id, graderId: teacherId, value: 77,
    } })
    service = new ResultsService(prisma as never)
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it('returns published results with totals, means, ranks and chronological trend', async () => {
    const results = await service.forStudent({ tenantId, personId: targetId, identityType: PersonType.STUDENT }, targetId)
    expect(results).toHaveLength(2)
    expect(results.map((item) => item.examDate.toISOString().slice(0, 10))).toEqual(['2026-01-01', '2026-02-01'])
    expect(results[0]).toMatchObject({ total: 90, average: 90, classRank: 2 })
    expect(results[0].subjects[0]).toMatchObject({ score: 90, rank: 2 })
  })

  it('allows only self for students and active linked children for parents', async () => {
    await expect(service.forStudent({ tenantId, personId: targetId, identityType: PersonType.STUDENT }, otherStudentId)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.forStudent({ tenantId, personId: parentId, identityType: PersonType.PARENT }, targetId)).resolves.toHaveLength(2)
    await expect(service.forStudent({ tenantId, personId: parentId, identityType: PersonType.PARENT }, otherStudentId)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.forStudent({ tenantId, personId: inactiveParentId, identityType: PersonType.PARENT }, targetId)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('returns only published scores inside the teacher active assignment boundary', async () => {
    const rows = await service.forTeacher({
      tenantId, personId: teacherId, identityType: PersonType.TEACHER,
    })
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((row) => row.subject))).toEqual(new Set(['Math']))
    expect(new Set(rows.map((row) => row.examTitle))).toEqual(new Set(['Exam 1']))
    expect(rows.map((row) => row.examTitle)).not.toContain('Other Exam')
    expect(rows.map((row) => row.examTitle)).not.toContain('Exam 2')
    expect(rows.map((row) => row.examTitle)).not.toContain('Exam 3')
  })
})
