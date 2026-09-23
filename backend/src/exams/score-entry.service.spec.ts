import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ExamStatus, PersonType, PrismaClient } from '@prisma/client'
import { ScoreEntryService } from './score-entry.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('ScoreEntryService', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const runId = crypto.randomUUID()
  let tenantId: string
  let teacherId: string
  let examId: string
  let subjectId: string

  beforeAll(async () => {
    await prisma.$connect()
    const tenant = await prisma.tenant.create({ data: { code: `scores-${runId}`, name: 'Scores School' } })
    tenantId = tenant.id
    const [teacher, student, outsider, classroom, otherClass, course] = await Promise.all([
      prisma.person.create({ data: { tenantId, eduplusId: 'teacher', type: PersonType.TEACHER, name: 'Teacher' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'student', type: PersonType.STUDENT, name: 'Student' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'outsider', type: PersonType.STUDENT, name: 'Outsider' } }),
      prisma.classroom.create({ data: { tenantId, eduplusId: 'class', name: 'Class' } }),
      prisma.classroom.create({ data: { tenantId, eduplusId: 'other-class', name: 'Other Class' } }),
      prisma.course.create({ data: { tenantId, eduplusId: 'math', name: 'Math' } }),
    ])
    teacherId = teacher.id
    await prisma.teachingAssignment.create({
      data: { tenantId, eduplusId: 'assignment', teacherId, classroomId: classroom.id, courseId: course.id },
    })
    await prisma.studentClassRelation.createMany({ data: [
      { tenantId, eduplusId: 'member', studentId: student.id, classroomId: classroom.id },
      { tenantId, eduplusId: 'outsider-member', studentId: outsider.id, classroomId: otherClass.id },
    ] })
    const exam = await prisma.exam.create({
      data: { tenantId, creatorId: teacherId, classroomId: classroom.id, title: 'Exam', type: 'test', examDate: new Date() },
    })
    examId = exam.id
    subjectId = (await prisma.examSubject.create({
      data: { tenantId, examId, courseId: course.id, maximumScore: 100 },
    })).id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  const actor = () => ({ tenantId, personId: teacherId, identityType: PersonType.TEACHER })
  const cell = (studentEduplusId = 'student', score: number | null = 88, absent = false) => ({
    studentEduplusId, subjectId, score, absent,
  })

  it.each([
    ['unknown student', [cell('unknown')]],
    ['student outside class', [cell('outsider')]],
    ['duplicate cell', [cell(), cell()]],
    ['negative score', [cell('student', -1)]],
    ['score above maximum', [cell('student', 101)]],
    ['absence with numeric score', [cell('student', 80, true)]],
  ])('rejects %s before writing any score', async (_name, cells) => {
    const service = new ScoreEntryService(prisma as never)
    await expect(service.save(actor(), examId, cells)).rejects.toBeInstanceOf(BadRequestException)
    expect(await prisma.score.count({ where: { tenantId, examId } })).toBe(0)
  })

  it('upserts a valid grid and rejects mutation after publication', async () => {
    const service = new ScoreEntryService(prisma as never)
    await expect(service.save(actor(), examId, [cell()])).resolves.toEqual({ saved: 1 })
    expect((await prisma.score.findFirstOrThrow({ where: { tenantId, examId } })).value?.toNumber()).toBe(88)
    await prisma.exam.update({ where: { id: examId }, data: { status: ExamStatus.PUBLISHED } })
    await expect(service.save(actor(), examId, [cell('student', 90)])).rejects.toBeInstanceOf(ForbiddenException)
  })
})
