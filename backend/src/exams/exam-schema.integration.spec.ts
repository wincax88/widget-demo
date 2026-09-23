import { ExamStatus, PersonType, PrismaClient } from '@prisma/client'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('examination persistence invariants', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const runId = globalThis.crypto.randomUUID()
  let tenantAId: string
  let tenantBId: string

  beforeAll(async () => {
    await prisma.$connect()
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({ data: { code: `exam-a-${runId}`, name: 'Exam Tenant A' } }),
      prisma.tenant.create({ data: { code: `exam-b-${runId}`, name: 'Exam Tenant B' } }),
    ])
    tenantAId = tenantA.id
    tenantBId = tenantB.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } })
    await prisma.$disconnect()
  })

  it('rejects duplicate score cells and cross-tenant score assembly', async () => {
    const [teacher, student, foreignStudent, classroom, mathematics, english] = await Promise.all([
      prisma.person.create({
        data: { tenantId: tenantAId, eduplusId: 'teacher-1', type: PersonType.TEACHER, name: 'Teacher' },
      }),
      prisma.person.create({
        data: { tenantId: tenantAId, eduplusId: 'student-1', type: PersonType.STUDENT, name: 'Student' },
      }),
      prisma.person.create({
        data: { tenantId: tenantBId, eduplusId: 'student-2', type: PersonType.STUDENT, name: 'Foreign Student' },
      }),
      prisma.classroom.create({
        data: { tenantId: tenantAId, eduplusId: 'class-1', name: 'Class 1' },
      }),
      prisma.course.create({
        data: { tenantId: tenantAId, eduplusId: 'math', name: 'Mathematics' },
      }),
      prisma.course.create({
        data: { tenantId: tenantAId, eduplusId: 'english', name: 'English' },
      }),
    ])
    const exam = await prisma.exam.create({
      data: {
        tenantId: tenantAId,
        creatorId: teacher.id,
        classroomId: classroom.id,
        title: 'Midterm',
        type: 'midterm',
        examDate: new Date('2026-09-01T00:00:00Z'),
        status: ExamStatus.DRAFT,
      },
    })
    const [mathSubject] = await Promise.all([
      prisma.examSubject.create({
        data: { tenantId: tenantAId, examId: exam.id, courseId: mathematics.id, maximumScore: 100, displayOrder: 0 },
      }),
      prisma.examSubject.create({
        data: { tenantId: tenantAId, examId: exam.id, courseId: english.id, maximumScore: 100, displayOrder: 1 },
      }),
    ])

    const score = {
      tenantId: tenantAId,
      examId: exam.id,
      subjectId: mathSubject.id,
      studentId: student.id,
      graderId: teacher.id,
      value: 88,
      absent: false,
    }
    await prisma.score.create({ data: score })
    await expect(prisma.score.create({ data: score })).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      prisma.score.create({ data: { ...score, studentId: foreignStudent.id } }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })
})
