import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get('ready')
  ready() {
    return { status: 'ok' }
  }
}
