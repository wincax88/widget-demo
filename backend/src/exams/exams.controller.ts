import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { AuthenticatedRequest, SessionGuard } from '../auth/session.guard'
import { CreateExamDto } from './dto/create-exam.dto'
import { UpdateExamDto } from './dto/update-exam.dto'
import { ImportScoresDto, SaveScoreGridDto } from './dto/save-score-grid.dto'
import { CsvImportService } from './csv-import.service'
import { ActorContext } from './exam.types'
import { ExamsService } from './exams.service'
import { ScoreEntryService } from './score-entry.service'

@Controller('exams')
@UseGuards(SessionGuard)
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly scoreEntry: ScoreEntryService,
    private readonly csvImport: CsvImportService,
  ) {}

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

  @Post(':id/scores')
  saveScores(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: SaveScoreGridDto) {
    return this.scoreEntry.save(this.actor(request), id, body.cells)
  }

  @Post(':id/imports')
  importScores(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: ImportScoresDto) {
    return this.csvImport.import(this.actor(request), id, body.filename, body.csv)
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    const session = request.appSession!
    if (!session.personId) throw new UnauthorizedException('Session identity is not synchronized')
    return { tenantId: session.tenantId, personId: session.personId, identityType: session.identityType }
  }
}
