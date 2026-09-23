import { Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common'
import { PersonType } from '@prisma/client'
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard'
import { DirectorySyncService } from './directory-sync.service'

@Controller('directory-sync')
@UseGuards(SessionGuard)
export class DirectorySyncController {
  constructor(private readonly directorySync: DirectorySyncService) {}

  @Post()
  sync(@Req() request: AuthenticatedRequest) {
    const session = request.appSession!
    if (
      session.identityType !== PersonType.TEACHER &&
      session.identityType !== PersonType.STAFF
    ) {
      throw new ForbiddenException('Only staff identities may synchronize school data')
    }
    return this.directorySync.sync(session)
  }

  @Get('runs')
  runs(@Req() request: AuthenticatedRequest) {
    return this.directorySync.listRuns(request.appSession!.tenantId)
  }
}
