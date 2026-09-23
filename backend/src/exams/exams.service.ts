import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ExamStatus, PersonType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateExamDto } from './dto/create-exam.dto'
import { UpdateExamDto } from './dto/update-exam.dto'
import { ActorContext } from './exam.types'

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: ActorContext, command: CreateExamDto) {
    this.assertStaffActor(actor)
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: command.classroomId, tenantId: actor.tenantId, active: true },
    })
    if (!classroom) throw new NotFoundException('Classroom was not found')
    for (const subject of command.subjects) {
      await this.assertTeachingAssignment(actor, command.classroomId, subject.courseId)
    }
    return this.prisma.$transaction(async (transaction) => {
      const exam = await transaction.exam.create({
        data: {
          tenantId: actor.tenantId,
          creatorId: actor.personId,
          classroomId: command.classroomId,
          title: command.title,
          type: command.type,
          examDate: new Date(command.examDate),
        },
      })
      if (command.subjects.length > 0) {
        await transaction.examSubject.createMany({
          data: command.subjects.map((subject, displayOrder) => ({
            tenantId: actor.tenantId,
            examId: exam.id,
            courseId: subject.courseId,
            maximumScore: new Prisma.Decimal(subject.maximumScore),
            displayOrder,
          })),
        })
      }
      return transaction.exam.findUniqueOrThrow({
        where: { id: exam.id },
        include: { subjects: { orderBy: { displayOrder: 'asc' } } },
      })
    })
  }

  list(actor: ActorContext) {
    return this.prisma.exam.findMany({
      where: { tenantId: actor.tenantId },
      include: { subjects: { include: { course: true }, orderBy: { displayOrder: 'asc' } } },
      orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async detail(actor: ActorContext, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { subjects: { include: { course: true }, orderBy: { displayOrder: 'asc' } } },
    })
    if (!exam) throw new NotFoundException('Exam was not found')
    return exam
  }

  async update(actor: ActorContext, id: string, command: UpdateExamDto) {
    const exam = await this.mutableExam(actor, id)
    return this.prisma.exam.update({
      where: { id: exam.id },
      data: {
        ...(command.title === undefined ? {} : { title: command.title }),
        ...(command.type === undefined ? {} : { type: command.type }),
        ...(command.examDate === undefined ? {} : { examDate: new Date(command.examDate) }),
      },
    })
  }

  async publish(actor: ActorContext, id: string) {
    const exam = await this.mutableExam(actor, id)
    const subjectCount = await this.prisma.examSubject.count({
      where: { tenantId: actor.tenantId, examId: exam.id },
    })
    if (subjectCount === 0) throw new ForbiddenException('At least one subject is required')
    return this.prisma.exam.update({
      where: { id: exam.id },
      data: { status: ExamStatus.PUBLISHED, publishedAt: new Date(), withdrawnAt: null },
    })
  }

  async withdraw(actor: ActorContext, id: string) {
    this.assertStaffActor(actor)
    const exam = await this.detail(actor, id)
    this.assertOwner(actor, exam.creatorId)
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw new ForbiddenException('Only published exams may be withdrawn')
    }
    return this.prisma.exam.update({
      where: { id: exam.id },
      data: { status: ExamStatus.WITHDRAWN, withdrawnAt: new Date() },
    })
  }

  private async mutableExam(actor: ActorContext, id: string) {
    this.assertStaffActor(actor)
    const exam = await this.detail(actor, id)
    this.assertOwner(actor, exam.creatorId)
    if (exam.status !== ExamStatus.DRAFT) {
      throw new ForbiddenException('Only draft exams may be changed')
    }
    return exam
  }

  private assertStaffActor(actor: ActorContext) {
    if (actor.identityType !== PersonType.TEACHER && actor.identityType !== PersonType.STAFF) {
      throw new ForbiddenException('A staff identity is required')
    }
  }

  private assertOwner(actor: ActorContext, creatorId: string) {
    if (actor.identityType === PersonType.TEACHER && creatorId !== actor.personId) {
      throw new ForbiddenException('Only the creating teacher may change this exam')
    }
  }

  private async assertTeachingAssignment(actor: ActorContext, classroomId: string, courseId: string) {
    if (actor.identityType === PersonType.STAFF) return
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: {
        tenantId: actor.tenantId,
        teacherId: actor.personId,
        classroomId,
        courseId,
        active: true,
      },
    })
    if (!assignment) throw new ForbiddenException('Teacher is not assigned to this class and subject')
  }
}
