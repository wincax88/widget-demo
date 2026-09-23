import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { PersonType } from '@prisma/client'
import { ActorContext } from '../exams/exam.types'
import { PrismaService } from '../prisma/prisma.service'
import { ResultsService } from '../results/results.service'
import { ExaminationWidgetKey, EXAMINATION_WIDGET_KEYS } from './widget-catalog'
import { WidgetAuthService } from './widget-auth.service'

export interface WidgetBatchItem {
  widget_key: string
  data_endpoint_key: string
  query_preset_key?: string
  params?: Record<string, unknown>
}

export interface WidgetBatchRequest {
  request_id: string
  widgets: WidgetBatchItem[]
}

type WidgetResult =
  | { status: 'ok'; data: unknown }
  | { status: 'error'; error: { code: string; message: string } }

@Injectable()
export class WidgetDataService {
  constructor(
    private readonly auth: WidgetAuthService,
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
  ) {}

  async batch(input: WidgetBatchRequest, authorization?: string) {
    this.validateBatch(input)
    const accessToken = bearerToken(authorization)
    const { tenant, identity } = await this.auth.verifyWidgetAccessToken(accessToken)
    const person = await this.prisma.person.findFirst({
      where: {
        tenantId: tenant.id,
        eduplusId: identity.identityId,
        type: identity.identityType,
        active: true,
      },
      select: { id: true, name: true },
    })
    const output: Record<string, WidgetResult> = {}
    if (!person) {
      for (const item of input.widgets) {
        output[item.widget_key] = failure('IDENTITY_NOT_SYNCED', '当前身份尚未同步到考试应用')
      }
      return { request_id: input.request_id, results: output }
    }

    const actor: ActorContext = {
      tenantId: tenant.id,
      personId: person.id,
      identityType: identity.identityType,
    }
    const studentResults = new Map<string, Promise<StudentExam[]>>()
    let teacherResults: Promise<TeacherScoreRow[]> | undefined
    let children: Promise<Array<{ id: string; eduplusId: string; name: string }>> | undefined

    for (const item of input.widgets) {
      try {
        this.assertAuthorized(item, identity)
        this.assertParams(item, identity.identityType)
        if (identity.identityType === PersonType.TEACHER || identity.identityType === PersonType.STAFF) {
          if (item.widget_key !== 'exam-score-table') {
            output[item.widget_key] = failure('ROLE_NOT_APPLICABLE', '当前身份不适用此组件')
            continue
          }
          teacherResults ??= this.results.forTeacher(actor) as Promise<TeacherScoreRow[]>
          output[item.widget_key] = success({ rows: teacherRows(await teacherResults) })
          continue
        }

        let studentId = person.id
        let studentName = person.name
        if (identity.identityType === PersonType.PARENT) {
          children ??= this.results.children(actor)
          const available = await children
          const requested = typeof item.params?.student_id === 'string'
            ? item.params.student_id
            : undefined
          const child = requested
            ? available.find((candidate) => candidate.eduplusId === requested)
            : available[0]
          if (!child) {
            output[item.widget_key] = failure('CHILD_NOT_AUTHORIZED', '未找到可访问的关联学生')
            continue
          }
          studentId = child.id
          studentName = child.name
        } else if (identity.identityType !== PersonType.STUDENT) {
          output[item.widget_key] = failure('ROLE_NOT_APPLICABLE', '当前身份不适用此组件')
          continue
        }
        const resultLimit = item.widget_key === 'exam-score-trend' ? 12 : 1
        const resultKey = `${studentId}\0${resultLimit}`
        let selectedResults = studentResults.get(resultKey)
        if (!selectedResults) {
          selectedResults = this.results.forStudent(
            actor,
            studentId,
            resultLimit,
          ) as Promise<StudentExam[]>
          studentResults.set(resultKey, selectedResults)
        }
        output[item.widget_key] = success(studentPayload(
          item.widget_key as ExaminationWidgetKey,
          await selectedResults,
          studentName,
        ))
      } catch (error) {
        output[item.widget_key] = error instanceof ItemFailure
          ? failure(error.code, error.message)
          : failure('WIDGET_DATA_UNAVAILABLE', '组件数据暂时不可用')
      }
    }
    return { request_id: input.request_id, results: output }
  }

  private validateBatch(input: WidgetBatchRequest) {
    if (
      !input || typeof input.request_id !== 'string' || !input.request_id.trim()
      || input.request_id.length > 512 || !Array.isArray(input.widgets)
      || input.widgets.length === 0 || input.widgets.length > 20
    ) {
      throw new BadRequestException('Invalid widget batch request')
    }
    const keys = new Set<string>()
    for (const item of input.widgets) {
      if (
        !item || typeof item.widget_key !== 'string' || typeof item.data_endpoint_key !== 'string'
        || !item.widget_key || !item.data_endpoint_key || keys.has(item.widget_key)
      ) {
        throw new BadRequestException('Invalid or duplicate widget request item')
      }
      keys.add(item.widget_key)
    }
  }

  private assertAuthorized(
    item: WidgetBatchItem,
    identity: Awaited<ReturnType<WidgetAuthService['verifyWidgetAccessToken']>>['identity'],
  ) {
    const pair = identity.endpointPairs.find((candidate) =>
      candidate.widgetKey === item.widget_key
      && candidate.dataEndpointKey === item.data_endpoint_key
      && (candidate.queryPresetKey ?? '') === (item.query_preset_key ?? ''))
    if (
      !EXAMINATION_WIDGET_KEYS.has(item.widget_key)
      || item.data_endpoint_key !== item.widget_key
      || !identity.widgetKeys.includes(item.widget_key)
      || !identity.dataEndpointKeys.includes(item.data_endpoint_key)
      || !pair
    ) {
      throw new ItemFailure('WIDGET_NOT_AUTHORIZED', '组件或数据端点未获授权')
    }
  }

  private assertParams(item: WidgetBatchItem, identityType: PersonType) {
    if (item.params === undefined) return
    if (!item.params || typeof item.params !== 'object' || Array.isArray(item.params)) {
      throw new ItemFailure('INVALID_WIDGET_PARAMS', '组件参数无效')
    }
    const keys = Object.keys(item.params)
    const allowed = identityType === PersonType.PARENT ? new Set(['student_id']) : new Set<string>()
    if (
      keys.some((key) => !allowed.has(key))
      || (item.params.student_id !== undefined
        && (typeof item.params.student_id !== 'string'
          || !item.params.student_id.trim()
          || item.params.student_id.length > 200))
    ) {
      throw new ItemFailure('INVALID_WIDGET_PARAMS', '组件参数无效')
    }
  }
}

class ItemFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function success(data: unknown): WidgetResult {
  return { status: 'ok', data }
}

function failure(code: string, message: string): WidgetResult {
  return { status: 'error', error: { code, message } }
}

function bearerToken(value?: string) {
  const match = /^Bearer ([^\s]+)$/i.exec(value ?? '')
  if (!match) throw new UnauthorizedException('Bearer access token is required')
  return match[1]
}

interface StudentExam {
  examId: string
  title: string
  examDate: Date
  total: number
  average: number
  classRank: number | null
  subjects: Array<{ name: string; score: number | null; rank: number | null }>
}

interface TeacherScoreRow {
  studentName: string
  subject: string
  score: number | null
  rank: number | null
}

function studentPayload(key: ExaminationWidgetKey, exams: StudentExam[], studentName: string) {
  const latest = exams.at(-1)
  if (key === 'exam-latest-summary') {
    return latest
      ? { title: latest.title, total: latest.total, average: latest.average, class_rank: latest.classRank }
      : { title: null, total: null, average: null, class_rank: null }
  }
  if (key === 'exam-score-table') {
    return { rows: latest?.subjects.map((subject) => ({
      student_name: studentName,
      subject: subject.name,
      score: subject.score,
      rank: subject.rank,
    })) ?? [] }
  }
  return { items: exams.map((exam) => ({
    exam_id: exam.examId,
    title: exam.title,
    exam_date: exam.examDate.toISOString(),
    summary: `总分 ${exam.total}，平均分 ${exam.average}，班级排名 ${exam.classRank ?? '-'}`,
  })) }
}

function teacherRows(rows: TeacherScoreRow[]) {
  return rows.map((row) => ({
    student_name: row.studentName,
    subject: row.subject,
    score: row.score,
    rank: row.rank,
  }))
}
