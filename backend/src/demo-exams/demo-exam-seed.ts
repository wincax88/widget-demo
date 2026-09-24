import { ExamStatus, PersonType, PrismaClient, TenantStatus } from '@prisma/client'
import { buildDemoScores, checkDemoStudents, DEMO_EXAMS, DEMO_SUBJECTS } from './demo-exam-batch'

export const DEMO_BATCH_KEY = 'demo-exams-20260924-v1'

export interface DemoSeedReport {
  tenantCode: string
  studentCount: number
  examCount: number
  subjectCount: number
  scoreCount: number
  applied: boolean
}

export async function runDemoSeed(prisma: PrismaClient, tenantCode: string, apply: boolean): Promise<DemoSeedReport> {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } })
  if (!tenant || tenant.status !== TenantStatus.ACTIVE) throw new Error('active tenant was not found')
  const students = await prisma.person.findMany({
    where: {
      tenantId: tenant.id,
      type: PersonType.STUDENT,
      active: true,
      eduplusId: { startsWith: 'student:' },
    },
    select: { id: true, eduplusId: true, eduplusUserId: true },
    orderBy: { eduplusId: 'asc' },
  })
  checkDemoStudents(students)
  const cells = buildDemoScores(students)
  const report: DemoSeedReport = {
    tenantCode,
    studentCount: students.length,
    examCount: DEMO_EXAMS.length,
    subjectCount: DEMO_EXAMS.length * DEMO_SUBJECTS.length,
    scoreCount: cells.length,
    applied: false,
  }
  if (!apply) return report

  await prisma.$transaction(async (tx) => {
    const creator = await tx.person.upsert({
      where: { tenantId_eduplusId: { tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:creator` } },
      create: {
        tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:creator`,
        type: PersonType.STAFF, name: '【演示】成绩生成器',
      },
      update: { type: PersonType.STAFF, name: '【演示】成绩生成器', active: true },
    })
    const classroom = await tx.classroom.upsert({
      where: { tenantId_eduplusId: { tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:class` } },
      create: { tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:class`, name: '【演示】全体学生组' },
      update: { name: '【演示】全体学生组', active: true },
    })
    const courses = new Map<string, string>()
    for (const subject of DEMO_SUBJECTS) {
      const course = await tx.course.upsert({
        where: { tenantId_eduplusId: { tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:course:${subject.key}` } },
        create: {
          tenantId: tenant.id, eduplusId: `${DEMO_BATCH_KEY}:course:${subject.key}`,
          code: `DEMO_${subject.key.toUpperCase()}`, name: subject.name,
        },
        update: { name: subject.name, active: true },
      })
      courses.set(subject.key, course.id)
    }
    for (const chunk of chunks(students, 400)) {
      await tx.studentClassRelation.createMany({
        data: chunk.map((student) => ({
          tenantId: tenant.id,
          eduplusId: `${DEMO_BATCH_KEY}:membership:${student.eduplusId}`,
          studentId: student.id,
          classroomId: classroom.id,
          active: true,
        })),
        skipDuplicates: true,
      })
    }

    const exams = new Map<string, { id: string; status: ExamStatus }>()
    const subjects = new Map<string, string>()
    for (const definition of DEMO_EXAMS) {
      const demoKey = `${DEMO_BATCH_KEY}:${definition.key}`
      let exam = await tx.exam.findUnique({ where: { tenantId_demoKey: { tenantId: tenant.id, demoKey } } })
      if (exam && (!exam.isDemo || exam.title !== definition.title || exam.status === ExamStatus.WITHDRAWN)) {
        throw new Error(`demo exam ${definition.key} conflicts with an existing record`)
      }
      exam ??= await tx.exam.create({ data: {
        tenantId: tenant.id, demoKey, isDemo: true,
        creatorId: creator.id, classroomId: classroom.id,
        title: definition.title, type: definition.type, examDate: new Date(definition.date),
      } })
      exams.set(definition.key, exam)
      for (const subject of DEMO_SUBJECTS) {
        const courseId = courses.get(subject.key)!
        let examSubject = await tx.examSubject.findUnique({
          where: { tenantId_examId_courseId: { tenantId: tenant.id, examId: exam.id, courseId } },
        })
        if (examSubject && examSubject.maximumScore.toNumber() !== 100) {
          throw new Error(`demo exam subject ${definition.key}/${subject.key} conflicts with an existing record`)
        }
        examSubject ??= await tx.examSubject.create({ data: {
          tenantId: tenant.id, examId: exam.id, courseId,
          maximumScore: 100, displayOrder: DEMO_SUBJECTS.indexOf(subject),
        } })
        subjects.set(`${definition.key}:${subject.key}`, examSubject.id)
      }
    }

    const expected = cells.map((cell) => ({
      tenantId: tenant.id,
      examId: exams.get(cell.examKey)!.id,
      subjectId: subjects.get(`${cell.examKey}:${cell.subjectKey}`)!,
      studentId: cell.studentId,
      graderId: creator.id,
      value: cell.value,
      absent: false,
    }))
    const existing = await tx.score.findMany({
      where: { tenantId: tenant.id, examId: { in: [...exams.values()].map((exam) => exam.id) } },
      select: { examId: true, subjectId: true, studentId: true, value: true, absent: true },
    })
    const expectedValues = new Map(expected.map((cell) => [scoreKey(cell), cell.value]))
    for (const score of existing) {
      if (score.absent || score.value?.toNumber() !== expectedValues.get(scoreKey(score))) {
        throw new Error('existing demonstration scores differ from the approved batch')
      }
    }
    for (const chunk of chunks(expected, 400)) {
      await tx.score.createMany({ data: chunk, skipDuplicates: true })
    }
    const actualCount = await tx.score.count({
      where: { tenantId: tenant.id, examId: { in: [...exams.values()].map((exam) => exam.id) } },
    })
    if (actualCount !== expected.length) throw new Error('demonstration score count did not match')
    for (const exam of exams.values()) {
      if (exam.status === ExamStatus.DRAFT) {
        await tx.exam.update({ where: { id: exam.id }, data: {
          status: ExamStatus.PUBLISHED, publishedAt: new Date(),
        } })
      }
    }
  }, { maxWait: 10_000, timeout: 120_000 })

  return { ...report, applied: true }
}

function scoreKey(cell: { examId: string; subjectId: string; studentId: string }) {
  return `${cell.examId}\0${cell.subjectId}\0${cell.studentId}`
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) yield items.slice(start, start + size)
}
