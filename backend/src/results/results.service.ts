import { ForbiddenException, Injectable } from '@nestjs/common'
import { ExamStatus, PersonType } from '@prisma/client'
import { ActorContext } from '../exams/exam.types'
import { PrismaService } from '../prisma/prisma.service'
import { competitionRanks } from './ranking'

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async children(actor: ActorContext) {
    if (actor.identityType !== PersonType.PARENT) throw new ForbiddenException('A parent identity is required')
    return this.prisma.parentStudentRelation.findMany({
      where: { tenantId: actor.tenantId, parentId: actor.personId, active: true, student: { active: true } },
      select: { student: { select: { id: true, eduplusId: true, name: true } } },
      orderBy: { student: { name: 'asc' } },
    }).then((relations) => relations.map((relation) => relation.student))
  }

  async forStudent(actor: ActorContext, studentId: string, limit?: number) {
    await this.assertAccess(actor, studentId)
    const boundedLimit = limit === undefined ? undefined : Math.max(1, Math.min(50, limit))
    const exams = await this.prisma.exam.findMany({
      where: {
        tenantId: actor.tenantId,
        status: ExamStatus.PUBLISHED,
        scores: { some: { studentId } },
      },
      include: {
        subjects: { include: { course: true }, orderBy: { displayOrder: 'asc' } },
        scores: true,
      },
      orderBy: boundedLimit
        ? [{ examDate: 'desc' }, { id: 'desc' }]
        : [{ examDate: 'asc' }, { id: 'asc' }],
      ...(boundedLimit ? { take: boundedLimit } : {}),
    })

    const results = exams.map((exam) => {
      const targetScores = exam.scores.filter((score) => score.studentId === studentId)
      const numeric = targetScores.filter((score) => score.value !== null)
      const total = numeric.reduce((sum, score) => sum + score.value!.toNumber(), 0)
      const average = numeric.length === 0 ? 0 : total / numeric.length
      const totals = new Map<string, number>()
      for (const score of exam.scores) {
        if (score.value !== null) totals.set(score.studentId, (totals.get(score.studentId) ?? 0) + score.value.toNumber())
      }
      const classRank = competitionRanks([...totals].map(([id, value]) => ({ id, value })))
        .find((row) => row.id === studentId)?.rank ?? null
      const subjects = exam.subjects.map((subject) => {
        const score = targetScores.find((item) => item.subjectId === subject.id)
        const ranks = competitionRanks(exam.scores
          .filter((item) => item.subjectId === subject.id && item.value !== null)
          .map((item) => ({ id: item.studentId, value: item.value!.toNumber() })))
        return {
          id: subject.id,
          name: subject.course.name,
          maximumScore: subject.maximumScore.toNumber(),
          score: score?.value?.toNumber() ?? null,
          absent: score?.absent ?? false,
          rank: ranks.find((row) => row.id === studentId)?.rank ?? null,
        }
      })
      return {
        examId: exam.id,
        title: exam.title,
        type: exam.type,
        examDate: exam.examDate,
        total,
        average,
        classRank,
        subjects,
      }
    })
    return boundedLimit ? results.reverse() : results
  }

  async forTeacher(actor: ActorContext) {
    if (actor.identityType !== PersonType.TEACHER && actor.identityType !== PersonType.STAFF) {
      throw new ForbiddenException('A staff identity is required')
    }
    const assignments = actor.identityType === PersonType.TEACHER
      ? await this.prisma.teachingAssignment.findMany({
        where: {
          tenantId: actor.tenantId,
          teacherId: actor.personId,
          active: true,
          classroom: { active: true },
          course: { active: true },
        },
        select: { classroomId: true, courseId: true },
      })
      : []
    const allowed = new Set(assignments.map((item) => `${item.classroomId}\0${item.courseId}`))
    if (actor.identityType === PersonType.TEACHER && allowed.size === 0) return []
    const exams = await this.prisma.exam.findMany({
      where: {
        tenantId: actor.tenantId,
        status: ExamStatus.PUBLISHED,
        ...(actor.identityType === PersonType.TEACHER
          ? {
            OR: assignments.map((item) => ({
              classroomId: item.classroomId,
              subjects: { some: { courseId: item.courseId } },
            })),
          }
          : {}),
      },
      include: {
        subjects: { include: { course: true }, orderBy: { displayOrder: 'asc' } },
        scores: { include: { student: true } },
      },
      orderBy: [{ examDate: 'desc' }, { id: 'desc' }],
      take: 1,
    })
    return exams.flatMap((exam) => exam.subjects.flatMap((subject) => {
      if (
        actor.identityType === PersonType.TEACHER
        && !allowed.has(`${exam.classroomId}\0${subject.courseId}`)
      ) return []
      const subjectScores = exam.scores.filter((score) => score.subjectId === subject.id)
      const ranks = new Map(competitionRanks(subjectScores
        .filter((score) => score.value !== null)
        .map((score) => ({ id: score.studentId, value: score.value!.toNumber() })))
        .map((rank) => [rank.id, rank.rank]))
      return subjectScores.map((score) => ({
        examId: exam.id,
        examTitle: exam.title,
        examDate: exam.examDate,
        studentId: score.studentId,
        studentName: score.student.name,
        subject: subject.course.name,
        score: score.value?.toNumber() ?? null,
        absent: score.absent,
        rank: ranks.get(score.studentId) ?? null,
      }))
    }))
  }

  private async assertAccess(actor: ActorContext, studentId: string) {
    if (actor.identityType === PersonType.STUDENT) {
      if (actor.personId !== studentId) throw new ForbiddenException('Students may read only their own results')
      return
    }
    if (actor.identityType === PersonType.PARENT) {
      const relation = await this.prisma.parentStudentRelation.findFirst({
        where: { tenantId: actor.tenantId, parentId: actor.personId, studentId, active: true },
      })
      if (!relation) throw new ForbiddenException('An active parent-child relationship is required')
      return
    }
    throw new ForbiddenException('Student or parent identity is required')
  }
}
