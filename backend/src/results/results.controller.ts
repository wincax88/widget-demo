import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard'
import { ActorContext } from '../exams/exam.types'
import { ResultsService } from './results.service'

@Controller('results')
@UseGuards(SessionGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('me')
  mine(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request)
    return this.results.forStudent(actor, actor.personId)
  }

  @Get('children')
  children(@Req() request: AuthenticatedRequest) {
    return this.results.children(this.actor(request))
  }

  @Get('children/:studentId')
  child(@Req() request: AuthenticatedRequest, @Param('studentId') studentId: string) {
    return this.results.forStudent(this.actor(request), studentId)
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    const session = request.appSession!
    if (!session.personId) throw new UnauthorizedException('Session identity is not synchronized')
    return { tenantId: session.tenantId, personId: session.personId, identityType: session.identityType }
  }
}
