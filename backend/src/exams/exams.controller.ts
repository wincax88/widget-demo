import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard'
import { CreateExamDto } from './dto/create-exam.dto'
import { UpdateExamDto } from './dto/update-exam.dto'
import { ActorContext } from './exam.types'
import { ExamsService } from './exams.service'

@Controller('exams')
@UseGuards(SessionGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateExamDto) {
    return this.exams.create(this.actor(request), body)
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.exams.list(this.actor(request))
  }

  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.exams.detail(this.actor(request), id)
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateExamDto) {
    return this.exams.update(this.actor(request), id, body)
  }

  @Post(':id/publish')
  publish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.exams.publish(this.actor(request), id)
  }

  @Post(':id/withdraw')
  withdraw(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.exams.withdraw(this.actor(request), id)
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    const session = request.appSession!
    if (!session.personId) throw new UnauthorizedException('Session identity is not synchronized')
    return { tenantId: session.tenantId, personId: session.personId, identityType: session.identityType }
  }
}
