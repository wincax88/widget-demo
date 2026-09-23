import { PersonType, PrismaClient } from '@prisma/client'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('Prisma tenant isolation', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('allows the same EduPlus person ID in different tenants only', async () => {
    const runId = crypto.randomUUID()
    const tenantA = await prisma.tenant.create({
      data: { code: `test-a-${runId}`, name: 'Tenant A' },
    })
    const tenantB = await prisma.tenant.create({
      data: { code: `test-b-${runId}`, name: 'Tenant B' },
    })

    try {
      await prisma.person.createMany({
        data: [
          { tenantId: tenantA.id, eduplusId: 'u-1', type: PersonType.TEACHER, name: 'A' },
          { tenantId: tenantB.id, eduplusId: 'u-1', type: PersonType.TEACHER, name: 'B' },
        ],
      })

      expect(await prisma.person.count({ where: { eduplusId: 'u-1' } })).toBe(2)
      await expect(
        prisma.person.create({
          data: { tenantId: tenantA.id, eduplusId: 'u-1', type: PersonType.TEACHER, name: 'Duplicate' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' })
    } finally {
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } })
    }
  })
})
