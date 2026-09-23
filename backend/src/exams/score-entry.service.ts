import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ExamStatus, PersonType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ActorContext, ScoreCell } from './exam.types'

export type PreparedScoreCell = {
  studentId: string
  subjectId: string
  value: Prisma.Decimal | null
  absent: boolean
}

@Injectable()
export class ScoreEntryService {
  constructor(private readonly prisma: PrismaService) {}

  async save(actor: ActorContext, examId: string, cells: ScoreCell[]) {
    const prepared = await this.validate(actor, examId, cells)
    await this.prisma.$transaction((transaction) => this.apply(transaction, actor, examId, prepared))
    return { saved: prepared.length }
  }

  async validate(actor: ActorContext, examId: string, cells: ScoreCell[]) {
    if (actor.identityType !== PersonType.TEACHER && actor.identityType !== PersonType.STAFF) {
      throw new ForbiddenException('A staff identity is required')
    }
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId: actor.tenantId },
      include: { subjects: true },
    })
    if (!exam) throw new NotFoundException('Exam was not found')
    if (exam.status !== ExamStatus.DRAFT) throw new ForbiddenException('Published scores cannot be changed')

    const subjects = new Map(exam.subjects.map((subject) => [subject.id, subject]))
    if (actor.identityType === PersonType.TEACHER) {
      const courseIds = [...new Set(cells.map((cell) => subjects.get(cell.subjectId)?.courseId).filter(Boolean))] as string[]
      const assignments = await this.prisma.teachingAssignment.findMany({
        where: { tenantId: actor.tenantId, teacherId: actor.personId, classroomId: exam.classroomId, courseId: { in: courseIds }, active: true },
      })
      const assigned = new Set(assignments.map((item) => item.courseId))
      if (courseIds.some((courseId) => !assigned.has(courseId))) {
        throw new ForbiddenException('Teacher is not assigned to one or more subjects')
      }
    }

    const seen = new Set<string>()
    for (const cell of cells) {
      const key = `${cell.studentEduplusId}\u0000${cell.subjectId}`
      if (seen.has(key)) throw new BadRequestException('Duplicate student and subject cell')
      seen.add(key)
      const subject = subjects.get(cell.subjectId)
      if (!subject) throw new BadRequestException('Unknown exam subject')
      if (cell.absent && cell.score !== null) throw new BadRequestException('Absent students cannot have a numeric score')
      if (cell.score !== null && (!Number.isFinite(cell.score) || cell.score < 0 || cell.score > subject.maximumScore.toNumber())) {
        throw new BadRequestException('Score is outside the allowed range')
      }
    }

    const externalIds = [...new Set(cells.map((cell) => cell.studentEduplusId))]
    const students = await this.prisma.person.findMany({
      where: { tenantId: actor.tenantId, eduplusId: { in: externalIds }, type: PersonType.STUDENT, active: true },
    })
    const byExternalId = new Map(students.map((student) => [student.eduplusId, student]))
    if (externalIds.some((id) => !byExternalId.has(id))) throw new BadRequestException('Unknown student')
    const memberships = await this.prisma.studentClassRelation.findMany({
      where: { tenantId: actor.tenantId, classroomId: exam.classroomId, studentId: { in: students.map((student) => student.id) }, active: true },
    })
    const members = new Set(memberships.map((membership) => membership.studentId))
    if (students.some((student) => !members.has(student.id))) throw new BadRequestException('Student is outside the exam class')

    return cells.map((cell): PreparedScoreCell => ({
      studentId: byExternalId.get(cell.studentEduplusId)!.id,
      subjectId: cell.subjectId,
      value: cell.score === null ? null : new Prisma.Decimal(cell.score),
      absent: cell.absent,
    }))
  }

  async apply(transaction: Prisma.TransactionClient, actor: ActorContext, examId: string, cells: PreparedScoreCell[]) {
    for (const cell of cells) {
      await transaction.score.upsert({
        where: { tenantId_examId_studentId_subjectId: { tenantId: actor.tenantId, examId, studentId: cell.studentId, subjectId: cell.subjectId } },
        create: { tenantId: actor.tenantId, examId, studentId: cell.studentId, subjectId: cell.subjectId, graderId: actor.personId, value: cell.value, absent: cell.absent },
        update: { graderId: actor.personId, value: cell.value, absent: cell.absent },
      })
    }
  }
}
