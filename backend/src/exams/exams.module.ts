import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ExamsController } from './exams.controller'
import { ExamsService } from './exams.service'
import { ScoreEntryService } from './score-entry.service'
import { CsvImportService } from './csv-import.service'

@Module({
  imports: [AuthModule],
  controllers: [ExamsController],
  providers: [ExamsService, ScoreEntryService, CsvImportService],
  exports: [ExamsService],
})
export class ExamsModule {}
