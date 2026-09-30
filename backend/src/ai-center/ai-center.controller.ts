import { Body, Controller, Get, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common'
import { SessionGuard } from '../auth/session.guard'
import { JsonOnly } from '../security/security.module'
import { AiCenterService, ChatInput } from './ai-center.service'
import { ChatDto } from './chat.dto'

@Controller('ai-center')
@UseGuards(SessionGuard)
export class AiCenterController {
  constructor(private readonly aiCenter: AiCenterService) {}

  @Get('status')
  status() {
    return this.aiCenter.status()
  }

  @Post('chat')
  @HttpCode(200)
  @JsonOnly()
  chat(
    // The interface keeps the global whitelist pipe from silently stripping unknown
    // fields before this route's stricter validation can reject them.
    @Body(new ValidationPipe({ expectedType: ChatDto, transform: true, whitelist: true, forbidNonWhitelisted: true }))
    input: ChatInput,
  ) {
    return this.aiCenter.chat(input)
  }
}
