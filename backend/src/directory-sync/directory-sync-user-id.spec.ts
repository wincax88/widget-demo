import { PersonType } from '@prisma/client'
import { DirectorySyncService } from './directory-sync.service'

describe('DirectorySyncService user identity projection', () => {
  it('stores the structural EduPlus user_id on the synchronized student without changing its typed record key', async () => {
    const personUpsert = jest.fn()
    const transaction = { person: { upsert: personUpsert }, classroom: { upsert: jest.fn() }, course: { upsert: jest.fn() } }
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction)),
      directorySyncRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const client = {
      getPage: jest.fn(async (entityType: string) => ({
        items: entityType === 'student'
          ? [{ id: 42, entity_type: 'student', external_id: null, deleted: false, fields: {
            user_id: 901, name: '测试学生', account_status: 'active',
          } }]
          : [],
        next_cursor: null,
      })),
    }
    const auth = { getAccessTokenForSession: jest.fn().mockResolvedValue('access-token') }
    const service = new DirectorySyncService(prisma as never, client as never, auth as never)

    await service.sync({ id: 'session-1', tenantId: 'tenant-1', identityId: 'user-1', identityType: PersonType.TEACHER })

    expect(personUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_eduplusId: { tenantId: 'tenant-1', eduplusId: 'student:42' } },
      create: expect.objectContaining({ eduplusUserId: '901' }),
      update: expect.objectContaining({ eduplusUserId: '901' }),
    }))
  })
})
