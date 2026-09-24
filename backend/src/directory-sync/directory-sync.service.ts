import { BadGatewayException, Injectable } from '@nestjs/common'
import { PersonType, Prisma, SyncStatus } from '@prisma/client'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { EduplusDirectoryClient, MasterDataRecord, Page } from './eduplus-directory.client'

const ENTITY_TYPES = [
  'teacher',
  'student',
  'parent',
  'class',
  'course',
  'teacher_teaching_assignment',
  'student_class_relation',
  'parent_student_relation',
] as const

interface SyncSession {
  id: string
  tenantId: string
  identityId: string
  identityType: PersonType
}

export async function collectPages<T>(
  load: (cursor?: string) => Promise<Page<T>>,
): Promise<T[]> {
  const result: T[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await load(cursor)
    result.push(...page.items)
    const next = page.next_cursor ?? undefined
    if (next && cursors.has(next)) {
      throw new BadGatewayException('EduPlus repeated an opaque cursor')
    }
    if (next) cursors.add(next)
    cursor = next
  } while (cursor)
  return result
}

@Injectable()
export class DirectorySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: EduplusDirectoryClient,
    private readonly auth: AuthService,
  ) {}

  async sync(session: SyncSession) {
    const run = await this.prisma.directorySyncRun.create({
      data: {
        tenantId: session.tenantId,
        requestedBy: session.identityId,
        status: SyncStatus.RUNNING,
      },
    })
    try {
      const accessToken = await this.auth.getAccessTokenForSession(session.id)
      const records = new Map<string, MasterDataRecord[]>()
      for (const entityType of ENTITY_TYPES) {
        records.set(
          entityType,
          await collectPages((cursor) => this.client.getPage(entityType, accessToken, cursor)),
        )
      }

      await this.syncPeople(session.tenantId, records)
      await this.syncClasses(session.tenantId, records.get('class')!)
      await this.syncCourses(session.tenantId, records.get('course')!)
      // Relationship references may be null without a unique external mapping; do not infer links.
      const counts = {
        teacher: records.get('teacher')!.length,
        student: records.get('student')!.length,
        parent: records.get('parent')!.length,
        class: records.get('class')!.length,
        course: records.get('course')!.length,
        skipped_teacher_teaching_assignment: records.get('teacher_teaching_assignment')!.length,
        skipped_student_class_relation: records.get('student_class_relation')!.length,
        skipped_parent_student_relation: records.get('parent_student_relation')!.length,
      }
      await this.prisma.directorySyncRun.update({
        where: { id: run.id },
        data: { status: SyncStatus.PARTIAL, counts, finishedAt: new Date() },
      })
      return { run_id: run.id, status: 'partial', counts }
    } catch (error) {
      await this.prisma.directorySyncRun.update({
        where: { id: run.id },
        data: {
          status: SyncStatus.FAILED,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
          finishedAt: new Date(),
        },
      })
      throw error
    }
  }

  listRuns(tenantId: string) {
    return this.prisma.directorySyncRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
  }

  private async syncPeople(tenantId: string, records: Map<string, MasterDataRecord[]>) {
    const groups: Array<[string, PersonType]> = [
      ['teacher', PersonType.TEACHER],
      ['student', PersonType.STUDENT],
      ['parent', PersonType.PARENT],
    ]
    await this.prisma.$transaction(async (transaction) => {
      for (const [entityType, type] of groups) {
        for (const record of records.get(entityType) ?? []) {
          const eduplusId = `${entityType}:${record.id}`
          const eduplusUserId = type === PersonType.STUDENT
            ? this.userId(record.fields.user_id)
            : null
          await transaction.person.upsert({
            where: { tenantId_eduplusId: { tenantId, eduplusId } },
            create: {
              tenantId,
              eduplusId,
              eduplusUserId,
              type,
              name: this.text(record.fields.name) ?? this.text(record.fields.username) ?? eduplusId,
              email: this.text(record.fields.email),
              active: this.isActive(record),
            },
            update: {
              type,
              eduplusUserId,
              name: this.text(record.fields.name) ?? this.text(record.fields.username) ?? eduplusId,
              email: this.text(record.fields.email),
              active: this.isActive(record),
            },
          })
        }
      }
    })
  }

  private async syncClasses(tenantId: string, records: MasterDataRecord[]) {
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const eduplusId = this.recordId(record)
        await transaction.classroom.upsert({
          where: { tenantId_eduplusId: { tenantId, eduplusId } },
          create: {
            tenantId,
            eduplusId,
            name: this.text(record.fields.name) ?? eduplusId,
            gradeName: this.text(record.fields.grade_code),
            active: this.isActive(record),
          },
          update: {
            name: this.text(record.fields.name) ?? eduplusId,
            gradeName: this.text(record.fields.grade_code),
            active: this.isActive(record),
          },
        })
      }
    })
  }

  private async syncCourses(tenantId: string, records: MasterDataRecord[]) {
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const eduplusId = this.recordId(record)
        const code = this.text(record.fields.code)
        await transaction.course.upsert({
          where: { tenantId_eduplusId: { tenantId, eduplusId } },
          create: {
            tenantId,
            eduplusId,
            code,
            name: this.text(record.fields.name) ?? eduplusId,
            active: this.isActive(record),
          },
          update: { code, name: this.text(record.fields.name) ?? eduplusId, active: this.isActive(record) },
        })
      }
    })
  }

  private async syncAssignments(tenantId: string, records: MasterDataRecord[]) {
    const [people, classes, courses] = await Promise.all([
      this.prisma.person.findMany({ where: { tenantId } }),
      this.prisma.classroom.findMany({ where: { tenantId } }),
      this.prisma.course.findMany({ where: { tenantId } }),
    ])
    const peopleByExternalId = new Map(people.map((item) => [item.eduplusId, item]))
    const classesByExternalId = new Map(classes.map((item) => [item.eduplusId, item]))
    const coursesByCode = new Map(courses.flatMap((item) => (item.code ? [[item.code, item] as const] : [])))
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const teacher = peopleByExternalId.get(this.text(record.fields.teacher_external_id) ?? '')
        const classroom = classesByExternalId.get(this.text(record.fields.class_external_id) ?? '')
        const course = coursesByCode.get(this.text(record.fields.course_code) ?? '')
        if (!teacher || !classroom || !course) {
          throw new BadGatewayException('EduPlus assignment references unknown master data')
        }
        const eduplusId = this.recordId(record)
        await transaction.teachingAssignment.upsert({
          where: { tenantId_eduplusId: { tenantId, eduplusId } },
          create: {
            tenantId,
            eduplusId,
            teacherId: teacher.id,
            classroomId: classroom.id,
            courseId: course.id,
            active: this.isActive(record, 'teaching_status'),
          },
          update: {
            teacherId: teacher.id,
            classroomId: classroom.id,
            courseId: course.id,
            active: this.isActive(record, 'teaching_status'),
          },
        })
      }
    })
  }

  private async syncParentRelations(tenantId: string, records: MasterDataRecord[]) {
    const people = await this.prisma.person.findMany({ where: { tenantId } })
    const byExternalId = new Map(people.map((item) => [item.eduplusId, item]))
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const parent = byExternalId.get(this.text(record.fields.parent_external_id) ?? '')
        const student = byExternalId.get(this.text(record.fields.student_external_id) ?? '')
        if (!parent || !student) {
          throw new BadGatewayException('EduPlus family relation references unknown people')
        }
        const eduplusId = this.recordId(record)
        await transaction.parentStudentRelation.upsert({
          where: { tenantId_eduplusId: { tenantId, eduplusId } },
          create: {
            tenantId,
            eduplusId,
            parentId: parent.id,
            studentId: student.id,
            relation: this.text(record.fields.relation_type),
            active: this.isActive(record),
          },
          update: {
            parentId: parent.id,
            studentId: student.id,
            relation: this.text(record.fields.relation_type),
            active: this.isActive(record),
          },
        })
      }
    })
  }

  private async syncStudentClasses(tenantId: string, records: MasterDataRecord[]) {
    const [people, classrooms] = await Promise.all([
      this.prisma.person.findMany({ where: { tenantId } }),
      this.prisma.classroom.findMany({ where: { tenantId } }),
    ])
    const peopleByExternalId = new Map(people.map((item) => [item.eduplusId, item]))
    const classesByExternalId = new Map(classrooms.map((item) => [item.eduplusId, item]))
    await this.prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const student = peopleByExternalId.get(this.text(record.fields.student_external_id) ?? '')
        const classroom = classesByExternalId.get(this.text(record.fields.class_external_id) ?? '')
        if (!student || student.type !== PersonType.STUDENT || !classroom) {
          throw new BadGatewayException('EduPlus student class relation references unknown master data')
        }
        const eduplusId = this.recordId(record)
        await transaction.studentClassRelation.upsert({
          where: { tenantId_eduplusId: { tenantId, eduplusId } },
          create: {
            tenantId,
            eduplusId,
            studentId: student.id,
            classroomId: classroom.id,
            active: this.isActive(record, 'enrollment_status'),
          },
          update: {
            studentId: student.id,
            classroomId: classroom.id,
            active: this.isActive(record, 'enrollment_status'),
          },
        })
      }
    })
  }

  private recordId(record: MasterDataRecord) {
    return record.external_id ?? String(record.id)
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null
  }

  private userId(value: unknown) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null
    if (typeof value === 'string') return /^\d+$/.test(value.trim()) ? value.trim() : null
    return null
  }

  private isActive(record: MasterDataRecord, statusField = 'account_status') {
    if (record.deleted) return false
    const status = this.text(record.fields[statusField])?.toLowerCase()
    return !status || !['inactive', 'disabled', 'revoked', 'deleted'].includes(status)
  }
}
