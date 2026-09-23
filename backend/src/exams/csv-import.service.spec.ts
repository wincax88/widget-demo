import { ImportStatus, PersonType, PrismaClient } from '@prisma/client'
import { CsvImportService } from './csv-import.service'
import { ScoreEntryService } from './score-entry.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('CsvImportService', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const runId = crypto.randomUUID()
  let tenantId: string
  let teacherId: string
  let examId: string
  let subjectId: string
  let service: CsvImportService

  beforeAll(async () => {
    await prisma.$connect()
    tenantId = (await prisma.tenant.create({ data: { code: `csv-${runId}`, name: 'CSV School' } })).id
    const [teacher, student, classroom, course] = await Promise.all([
      prisma.person.create({ data: { tenantId, eduplusId: 'teacher', type: PersonType.TEACHER, name: 'Teacher' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'student,one', type: PersonType.STUDENT, name: 'Student' } }),
      prisma.classroom.create({ data: { tenantId, eduplusId: 'class', name: 'Class' } }),
      prisma.course.create({ data: { tenantId, eduplusId: 'math', name: 'Math' } }),
    ])
    teacherId = teacher.id
    await prisma.teachingAssignment.create({ data: { tenantId, eduplusId: 'assignment', teacherId, classroomId: classroom.id, courseId: course.id } })
    await prisma.studentClassRelation.create({ data: { tenantId, eduplusId: 'member', studentId: student.id, classroomId: classroom.id } })
    const exam = await prisma.exam.create({ data: { tenantId, creatorId: teacherId, classroomId: classroom.id, title: 'CSV Exam', type: 'test', examDate: new Date() } })
    examId = exam.id
    subjectId = (await prisma.examSubject.create({ data: { tenantId, examId, courseId: course.id, maximumScore: 100 } })).id
    service = new CsvImportService(prisma as never, new ScoreEntryService(prisma as never))
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  const actor = () => ({ tenantId, personId: teacherId, identityType: PersonType.TEACHER })
  const header = 'student_id,subject_id,score,absent'

  it.each(['duplicate row', 'malformed number'])('records %s errors and applies no scores', async (name) => {
    const csv = name === 'duplicate row'
      ? `${header}\n"student,one",${subjectId},88,false\n"student,one",${subjectId},90,false`
      : `${header}\n"student,one",${subjectId},eighty,false`
    const result = await service.import(actor(), examId, 'scores.csv', csv)
    expect(result.status).toBe(ImportStatus.FAILED)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(await prisma.score.count({ where: { tenantId, examId } })).toBe(0)
  })

  it('parses a BOM comma CSV and applies scores atomically', async () => {
    const csv = `\uFEFF${header}\n"student,one",${subjectId},88.5,false`
    const result = await service.import(actor(), examId, 'scores.csv', csv)
    expect(result.status).toBe(ImportStatus.APPLIED)
    expect(result.appliedRows).toBe(1)
    expect((await prisma.score.findFirstOrThrow({ where: { tenantId, examId } })).value?.toNumber()).toBe(88.5)
  })
})
