import { HealthController } from './health.controller'
import { PrismaService } from '../prisma/prisma.service'

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() }
  const controller = new HealthController(prisma as unknown as PrismaService)

  beforeEach(() => prisma.$queryRaw.mockReset())

  it('returns a stable liveness payload without probing dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok' })
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('reports ready after a successful database probe', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' })
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable when the database probe fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'))

    await expect(controller.ready()).rejects.toMatchObject({ status: 503 })
  })
})
