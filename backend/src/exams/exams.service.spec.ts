import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ExamStatus, PersonType, PrismaClient } from '@prisma/client'
import { ExamsService } from './exams.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('ExamsService lifecycle and authorization', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const runId = crypto.randomUUID()
  let service: ExamsService
  let tenantId: string
  let otherTenantId: string
  let teacherId: string
  let unassignedTeacherId: string
  let classroomId: string
  let mathId: string
  let englishId: string

  beforeAll(async () => {
    await prisma.$connect()
    service = new ExamsService(prisma as never)
    const [tenant, otherTenant] = await Promise.all([
      prisma.tenant.create({ data: { code: `lifecycle-${runId}`, name: 'Lifecycle School' } }),
      prisma.tenant.create({ data: { code: `foreign-${runId}`, name: 'Foreign School' } }),
    ])
    tenantId = tenant.id
    otherTenantId = otherTenant.id
    const [teacher, unassigned, student, classroom, math, english] = await Promise.all([
      prisma.person.create({ data: { tenantId, eduplusId: 'teacher', type: PersonType.TEACHER, name: 'Teacher' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'other-teacher', type: PersonType.TEACHER, name: 'Other' } }),
      prisma.person.create({ data: { tenantId, eduplusId: 'student', type: PersonType.STUDENT, name: 'Student' } }),
      prisma.classroom.create({ data: { tenantId, eduplusId: 'class', name: 'Class' } }),
      prisma.course.create({ data: { tenantId, eduplusId: 'math', name: 'Math' } }),
      prisma.course.create({ data: { tenantId, eduplusId: 'english', name: 'English' } }),
    ])
    teacherId = teacher.id
    unassignedTeacherId = unassigned.id
    classroomId = classroom.id
    mathId = math.id
    englishId = english.id
    await prisma.teachingAssignment.create({
      data: { tenantId, eduplusId: 'assignment', teacherId, classroomId, courseId: mathId },
    })
    await prisma.studentClassRelation.create({
      data: { tenantId, eduplusId: 'membership', studentId: student.id, classroomId },
    })
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } })
    await prisma.$disconnect()
  })

  const actor = () => ({ tenantId, personId: teacherId, identityType: PersonType.TEACHER })
  const command = (courseId = mathId) => ({
    classroomId,
    title: 'Midterm',
    type: 'midterm',
    examDate: '2026-09-01',
    subjects: [{ courseId, maximumScore: 100 }],
  })

  it('allows only the assigned teacher and taught subjects', async () => {
    const exam = await service.create(actor(), command())
    expect(exam.status).toBe(ExamStatus.DRAFT)

    await expect(service.create(
      { ...actor(), personId: unassignedTeacherId },
      command(),
    )).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.create(actor(), command(englishId))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('edits drafts, requires subjects to publish, then prevents mutation and can withdraw', async () => {
    const draft = await service.create(actor(), command())
    const updated = await service.update(actor(), draft.id, { title: 'Updated Midterm' })
    expect(updated.title).toBe('Updated Midterm')

    const empty = await service.create(actor(), { ...command(), title: 'Empty', subjects: [] })
    await expect(service.publish(actor(), empty.id)).rejects.toBeInstanceOf(ForbiddenException)

    const published = await service.publish(actor(), draft.id)
    expect(published.status).toBe(ExamStatus.PUBLISHED)
    await expect(service.update(actor(), draft.id, { title: 'Too late' })).rejects.toBeInstanceOf(ForbiddenException)
    expect((await service.withdraw(actor(), draft.id)).status).toBe(ExamStatus.WITHDRAWN)
  })

  it('never resolves an exam through another tenant context', async () => {
    const exam = await service.create(actor(), command())
    await expect(service.detail(
      { tenantId: otherTenantId, personId: teacherId, identityType: PersonType.TEACHER },
      exam.id,
    )).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns only the teacher assigned classes, courses and active students', async () => {
    await expect(service.options(actor())).resolves.toEqual({
      classrooms: [{
        id: classroomId,
        name: 'Class',
        courses: [{ id: mathId, name: 'Math' }],
        students: [{ eduplusId: 'student', name: 'Student' }],
      }],
    })
  })
})
