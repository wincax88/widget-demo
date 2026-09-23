import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return { status: 'ok' }
  }

  @Get('ready')
  async ready() {
    let timeout: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('database probe timed out')), 2_000)
        }),
      ])
      return { status: 'ok' }
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' })
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
