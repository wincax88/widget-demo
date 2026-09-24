import { ExamStatus, PersonType, PrismaClient, TenantStatus } from '@prisma/client'
import { runDemoSeed } from './demo-exam-seed'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('main09 demonstration exam persistence', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const tenantCode = `demo-seed-${globalThis.crypto.randomUUID()}`
  let tenantId: string
  let firstStudentId: string

  beforeAll(async () => {
    await prisma.$connect()
    const tenant = await prisma.tenant.create({ data: {
      code: tenantCode, name: 'Demo Seed Test', status: TenantStatus.ACTIVE,
    } })
    tenantId = tenant.id
    const first = await prisma.person.create({ data: {
      tenantId, eduplusId: 'student:101', eduplusUserId: '901', type: PersonType.STUDENT, name: '学生一',
    } })
    firstStudentId = first.id
    await prisma.person.create({ data: {
      tenantId, eduplusId: 'student:102', eduplusUserId: '902', type: PersonType.STUDENT, name: '学生二',
    } })
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { code: tenantCode } })
    await prisma.$disconnect()
  })

  it('previews without writes, publishes complete exams, and repeats idempotently', async () => {
    expect(await runDemoSeed(prisma, tenantCode, false)).toMatchObject({ studentCount: 2, scoreCount: 18, applied: false })
    expect(await prisma.exam.count({ where: { tenantId } })).toBe(0)

    expect(await runDemoSeed(prisma, tenantCode, true)).toMatchObject({ studentCount: 2, scoreCount: 18, applied: true })
    expect(await prisma.exam.count({ where: { tenantId, status: ExamStatus.PUBLISHED } })).toBe(3)
    expect(await prisma.examSubject.count({ where: { tenantId } })).toBe(9)
    expect(await prisma.score.count({ where: { tenantId } })).toBe(18)
    const exams = await prisma.exam.findMany({ where: { tenantId }, orderBy: { examDate: 'asc' } })
    expect(exams).toHaveLength(3)
    expect(exams.every((exam) => exam.title.startsWith('【演示】'))).toBe(true)
    expect(exams).toEqual(expect.arrayContaining([expect.objectContaining({ isDemo: true })]))
    expect(await prisma.score.count({ where: { tenantId, studentId: firstStudentId } })).toBe(9)

    await runDemoSeed(prisma, tenantCode, true)
    expect(await prisma.exam.count({ where: { tenantId } })).toBe(3)
    expect(await prisma.score.count({ where: { tenantId } })).toBe(18)
  })

  it('includes synchronized students without accounts and inactive students in the full batch', async () => {
    const unbound = await prisma.person.create({ data: {
      tenantId, eduplusId: 'student:103', type: PersonType.STUDENT, name: '缺少账号',
    } })
    const inactive = await prisma.person.create({ data: {
      tenantId, eduplusId: 'student:104', eduplusUserId: '904', type: PersonType.STUDENT,
      name: '停用账号', active: false,
    } })
    expect(await runDemoSeed(prisma, tenantCode, false)).toMatchObject({ studentCount: 4, scoreCount: 36, applied: false })
    expect(await runDemoSeed(prisma, tenantCode, true)).toMatchObject({ studentCount: 4, scoreCount: 36, applied: true })
    expect(await prisma.exam.count({ where: { tenantId } })).toBe(3)
    expect(await prisma.score.count({ where: { tenantId } })).toBe(36)
    expect(await prisma.score.count({ where: { tenantId, studentId: unbound.id } })).toBe(9)
    expect(await prisma.score.count({ where: { tenantId, studentId: inactive.id } })).toBe(9)
  })
})
