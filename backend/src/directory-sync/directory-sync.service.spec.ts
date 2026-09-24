import { ForbiddenException } from '@nestjs/common'
import { PersonType, PrismaClient, TenantStatus } from '@prisma/client'
import { DirectorySyncService } from './directory-sync.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('DirectorySyncService', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const tenantCode = `sync-${globalThis.crypto.randomUUID()}`
  const calls: Array<{ entityType: string; cursor?: string }> = []
  const firstPages: Record<string, unknown[]> = {
    teacher: [record('teacher', 'teacher-1', { name: 'Teacher One' })],
    student: [record('student', 'student-1', { name: 'Student One' })],
    parent: [record('parent', 'parent-1', { name: 'Parent One' })],
    class: [record('class', 'class-1', { name: 'Class One', grade_code: 'G1' })],
    course: [record('course', 'course-1', { code: 'MATH', name: 'Mathematics' })],
    teacher_teaching_assignment: [
      record('teacher_teaching_assignment', 'assignment-1', {
        teacher_external_id: 'teacher-1',
        class_external_id: 'class-1',
        course_code: 'MATH',
        teaching_status: 'active',
      }),
    ],
    student_class_relation: [
      record('student_class_relation', 'membership-1', {
        student_external_id: 'student-1',
        class_external_id: 'class-1',
        enrollment_status: 'active',
      }),
    ],
    parent_student_relation: [
      record('parent_student_relation', 'relation-1', {
        parent_external_id: 'parent-1',
        student_external_id: 'student-1',
        relation_type: 'mother',
      }),
    ],
  }
  const client = {
    getPage: jest.fn(async (entityType: string, _token: string, cursor?: string) => {
      calls.push({ entityType, cursor })
      return cursor
        ? { items: [], next_cursor: null }
        : { items: firstPages[entityType], next_cursor: `${entityType}-next` }
    }),
  }
  const auth = { getAccessTokenForSession: jest.fn().mockResolvedValue('access-token') }
  const service = new DirectorySyncService(prisma as never, client as never, auth as never)
  let tenantId: string

  beforeAll(async () => {
    await prisma.$connect()
    tenantId = (
      await prisma.tenant.create({
        data: { code: tenantCode, name: 'Sync School', status: TenantStatus.ACTIVE },
      })
    ).id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { code: tenantCode } })
    await prisma.$disconnect()
  })

  it('imports base data, reports skipped relationships, and repeats idempotently', async () => {
    const session = { id: 'session-1', tenantId, identityId: 'teacher-1', identityType: PersonType.TEACHER }

    const first = await service.sync(session)
    const second = await service.sync(session)

    for (const entityType of Object.keys(firstPages)) {
      expect(calls).toContainEqual({ entityType, cursor: `${entityType}-next` })
    }
    expect(first).toMatchObject({
      status: 'partial',
      counts: {
        teacher: 1,
        student: 1,
        parent: 1,
        class: 1,
        course: 1,
        skipped_teacher_teaching_assignment: 1,
        skipped_student_class_relation: 1,
        skipped_parent_student_relation: 1,
      },
    })
    expect(second.status).toBe('partial')
    const runs = await prisma.directorySyncRun.findMany({ where: { tenantId } })
    expect(runs).toHaveLength(2)
    expect(runs.map((run) => String(run.status))).toEqual(['PARTIAL', 'PARTIAL'])
    expect(await prisma.person.count({ where: { tenantId } })).toBe(3)
    expect(await prisma.classroom.count({ where: { tenantId } })).toBe(1)
    expect(await prisma.course.count({ where: { tenantId } })).toBe(1)
    expect(await prisma.teachingAssignment.count({ where: { tenantId } })).toBe(0)
    expect(await prisma.studentClassRelation.count({ where: { tenantId } })).toBe(0)
    expect(await prisma.parentStudentRelation.count({ where: { tenantId } })).toBe(0)
  })

  it('keeps distinct person types when EduPlus record IDs overlap and external IDs are null', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { code: `sync-collision-${globalThis.crypto.randomUUID()}`, name: 'Collision School' },
    })
    const overlapping = ['teacher', 'student', 'parent']
    const collisionClient = {
      getPage: jest.fn(async (entityType: string) => ({
        items: overlapping.includes(entityType)
          ? [{ id: 42, entity_type: entityType, external_id: null, deleted: false, fields: { name: entityType } }]
          : [],
        next_cursor: null,
      })),
    }
    const collisionService = new DirectorySyncService(prisma as never, collisionClient as never, auth as never)
    try {
      await collisionService.sync({
        id: 'session-1',
        tenantId: otherTenant.id,
        identityId: 'teacher-1',
        identityType: PersonType.TEACHER,
      })
      const people = await prisma.person.findMany({
        where: { tenantId: otherTenant.id },
        select: { eduplusId: true, type: true },
      })
      expect(people).toEqual(expect.arrayContaining([
        { eduplusId: 'teacher:42', type: PersonType.TEACHER },
        { eduplusId: 'student:42', type: PersonType.STUDENT },
        { eduplusId: 'parent:42', type: PersonType.PARENT },
      ]))
      expect(people).toHaveLength(3)
    } finally {
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    }
  })

  it('aborts an upstream 403 without widening the requested scope', async () => {
    const before = await prisma.person.count({ where: { tenantId } })
    client.getPage.mockRejectedValueOnce(new ForbiddenException('scope denied'))

    await expect(
      service.sync({
        id: 'session-1',
        tenantId,
        identityId: 'teacher-1',
        identityType: PersonType.TEACHER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(await prisma.person.count({ where: { tenantId } })).toBe(before)
    expect(auth.getAccessTokenForSession).toHaveBeenLastCalledWith('session-1')
  })
})

function record(entityType: string, externalId: string, fields: Record<string, unknown>) {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    entity_type: entityType,
    external_id: externalId,
    deleted: false,
    fields,
  }
}
