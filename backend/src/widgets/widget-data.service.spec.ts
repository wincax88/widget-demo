import { PersonType } from '@prisma/client'
import { WidgetDataService } from './widget-data.service'

describe('WidgetDataService', () => {
  const exams = [
    {
      examId: 'exam-1', title: '期中考试', type: 'midterm', examDate: new Date('2026-04-20'),
      total: 180, average: 90, classRank: 2,
      subjects: [
        { id: 'subject-1', name: '语文', maximumScore: 100, score: 92, absent: false, rank: 1 },
        { id: 'subject-2', name: '数学', maximumScore: 100, score: 88, absent: false, rank: 3 },
      ],
    },
    {
      examId: 'exam-2', title: '期末考试', type: 'final', examDate: new Date('2026-06-30'),
      total: 190, average: 95, classRank: 1,
      subjects: [{ id: 'subject-3', name: '语文', maximumScore: 100, score: 95, absent: false, rank: 1 }],
    },
  ]

  const create = (identityType: PersonType = PersonType.STUDENT) => {
    const auth = {
      verifyWidgetAccessToken: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-local-1', eduplusTenantId: '42' },
        identity: {
          sub: 'keycloak-user', tenantId: '42', identityId: 'student-eui', identityType,
          clientId: 'oc_tenant_1', appCode: 'demo-school', configSnapshotId: 'snapshot-1',
          scope: 'widget.data.read',
          widgetKeys: ['exam-latest-summary', 'exam-score-table', 'exam-score-trend'],
          dataEndpointKeys: ['exam-latest-summary', 'exam-score-table', 'exam-score-trend'],
          endpointPairs: [
            { widgetKey: 'exam-latest-summary', dataEndpointKey: 'exam-latest-summary' },
            { widgetKey: 'exam-score-table', dataEndpointKey: 'exam-score-table' },
            { widgetKey: 'exam-score-trend', dataEndpointKey: 'exam-score-trend' },
          ],
        },
      }),
    }
    const prisma = {
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1', name: '学生甲' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'person-1', name: '学生甲' }]),
      },
    }
    const results = {
      forStudent: jest.fn().mockResolvedValue(exams),
      children: jest.fn(),
      forTeacher: jest.fn(),
    }
    return {
      service: new WidgetDataService(auth as never, prisma as never, results as never),
      auth, prisma, results,
    }
  }

  it('returns real student summary, subject table and chronological trend from ResultsService', async () => {
    const { service, results } = create()
    const response = await service.batch({
      request_id: 'request-1',
      widgets: [
        item('exam-latest-summary'), item('exam-score-table'), item('exam-score-trend'),
      ],
    }, 'Bearer signed-token')

    const actor = {
      tenantId: 'tenant-local-1', personId: 'person-1', identityType: PersonType.STUDENT,
    }
    expect(results.forStudent).toHaveBeenCalledWith(actor, 'person-1', 1)
    expect(results.forStudent).toHaveBeenCalledWith(actor, 'person-1', 12)
    expect(response.request_id).toBe('request-1')
    expect(response.results['exam-latest-summary']).toEqual({ status: 'ok', data: {
      title: '期末考试', total: 190, average: 95, class_rank: 1,
    } })
    expect(response.results['exam-score-table']).toEqual({ status: 'ok', data: { rows: [
      { student_name: '学生甲', subject: '语文', score: 95, rank: 1 },
    ] } })
    expect(response.results['exam-score-trend']).toMatchObject({ status: 'ok', data: { items: [
      { exam_id: 'exam-1', title: '期中考试', exam_date: '2026-04-20T00:00:00.000Z' },
      { exam_id: 'exam-2', title: '期末考试', exam_date: '2026-06-30T00:00:00.000Z' },
    ] } })
    expect(JSON.stringify(response)).not.toMatch(/mock|example/i)
  })

  it('binds a student widget token only to one active synchronized student with the same EduPlus user ID', async () => {
    const { service, prisma } = create()
    await service.batch({ request_id: 'identity-match', widgets: [item('exam-latest-summary')] }, 'Bearer signed-token')

    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-local-1',
        eduplusUserId: 'student-eui',
        type: PersonType.STUDENT,
        active: true,
      },
      select: { id: true, name: true },
      take: 2,
    })
  })

  it('does not bind an ambiguous synchronized identity', async () => {
    const { service, prisma, results } = create()
    prisma.person.findMany.mockResolvedValueOnce([
      { id: 'person-1', name: '学生甲' },
      { id: 'person-2', name: '学生乙' },
    ])
    const response = await service.batch({ request_id: 'identity-conflict', widgets: [item('exam-score-table')] }, 'Bearer signed-token')
    expect(response.results['exam-score-table']).toMatchObject({
      status: 'error', error: { code: 'IDENTITY_NOT_SYNCED' },
    })
    expect(results.forStudent).not.toHaveBeenCalled()
  })

  it('resolves only an active linked child for a parent request', async () => {
    const { service, results } = create(PersonType.PARENT)
    results.children.mockResolvedValue([
      { id: 'child-local-1', eduplusId: 'child-eui-1', name: '孩子甲' },
    ])
    results.forStudent.mockResolvedValue(exams)

    await service.batch({
      request_id: 'request-parent',
      widgets: [item('exam-score-table', { student_id: 'child-eui-1' })],
    }, 'Bearer signed-token')

    expect(results.forStudent).toHaveBeenCalledWith(expect.objectContaining({
      identityType: PersonType.PARENT,
    }), 'child-local-1', 1)
  })

  it('delegates teacher table visibility to assignment-scoped ResultsService logic', async () => {
    const { service, results } = create(PersonType.TEACHER)
    results.forTeacher.mockResolvedValue([
      { studentName: '学生乙', subject: '数学', score: 86, rank: 4 },
    ])

    const response = await service.batch({
      request_id: 'request-teacher', widgets: [item('exam-score-table')],
    }, 'Bearer signed-token')

    expect(results.forTeacher).toHaveBeenCalledWith({
      tenantId: 'tenant-local-1', personId: 'person-1', identityType: PersonType.TEACHER,
    })
    expect(response.results['exam-score-table']).toEqual({ status: 'ok', data: { rows: [
      { student_name: '学生乙', subject: '数学', score: 86, rank: 4 },
    ] } })
  })

  it('isolates unlisted pairs and invalid params without failing authorized widgets', async () => {
    const { service } = create()
    const response = await service.batch({
      request_id: 'request-partial',
      widgets: [
        { widget_key: 'exam-score-trend', data_endpoint_key: 'other-endpoint' },
        item('exam-score-table', { tenant_id: 'attacker-tenant' }),
        item('exam-latest-summary'),
      ],
    }, 'Bearer signed-token')

    expect(response.results['exam-score-trend']).toMatchObject({
      status: 'error', error: { code: 'WIDGET_NOT_AUTHORIZED' },
    })
    expect(response.results['exam-score-table']).toMatchObject({
      status: 'error', error: { code: 'INVALID_WIDGET_PARAMS' },
    })
    expect(response.results['exam-latest-summary']).toMatchObject({ status: 'ok' })
  })

  it('enforces the server-owned endpoint mapping even when a token signs another pair', async () => {
    const { service, auth } = create()
    const context = await auth.verifyWidgetAccessToken.mock.results[0]?.value
      ?? await auth.verifyWidgetAccessToken()
    auth.verifyWidgetAccessToken.mockResolvedValue({
      ...context,
      identity: {
        ...context.identity,
        dataEndpointKeys: ['unexpected-endpoint'],
        endpointPairs: [{
          widgetKey: 'exam-score-table', dataEndpointKey: 'unexpected-endpoint',
        }],
      },
    })

    const response = await service.batch({
      request_id: 'request-mapping',
      widgets: [{
        widget_key: 'exam-score-table', data_endpoint_key: 'unexpected-endpoint',
      }],
    }, 'Bearer signed-token')
    expect(response.results['exam-score-table']).toMatchObject({
      status: 'error', error: { code: 'WIDGET_NOT_AUTHORIZED' },
    })
  })

  it('returns an explicit empty state when the synchronized identity or results are absent', async () => {
    const { service, prisma, results } = create()
    prisma.person.findMany.mockResolvedValueOnce([])
    const missing = await service.batch({
      request_id: 'request-missing', widgets: [item('exam-latest-summary')],
    }, 'Bearer signed-token')
    expect(missing.results['exam-latest-summary']).toMatchObject({
      status: 'error', error: { code: 'IDENTITY_NOT_SYNCED' },
    })

    prisma.person.findMany.mockResolvedValueOnce([{ id: 'person-1', name: '学生甲' }])
    results.forStudent.mockResolvedValueOnce([])
    const empty = await service.batch({
      request_id: 'request-empty', widgets: [item('exam-score-table')],
    }, 'Bearer signed-token')
    expect(empty.results['exam-score-table']).toEqual({ status: 'ok', data: { rows: [] } })
  })
})

function item(widgetKey: string, params?: Record<string, unknown>) {
  return { widget_key: widgetKey, data_endpoint_key: widgetKey, ...(params ? { params } : {}) }
}
