import { BadRequestException, Injectable } from '@nestjs/common'
import { ImportStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ActorContext, ScoreCell } from './exam.types'
import { ScoreEntryService } from './score-entry.service'

type CsvError = { rowNumber: number; code: string; message: string; rawValue?: unknown }

@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService, private readonly scoreEntry: ScoreEntryService) {}

  async import(actor: ActorContext, examId: string, filename: string, source: string) {
    const scoreImport = await this.prisma.scoreImport.create({
      data: { tenantId: actor.tenantId, examId, createdById: actor.personId, filename },
    })
    const parsed = this.parse(source)
    if (parsed.errors.length > 0) return this.fail(scoreImport.id, parsed.rows.length, parsed.errors)

    try {
      const prepared = await this.scoreEntry.validate(actor, examId, parsed.cells)
      return await this.prisma.$transaction(async (transaction) => {
        await this.scoreEntry.apply(transaction, actor, examId, prepared)
        return transaction.scoreImport.update({
          where: { id: scoreImport.id },
          data: { status: ImportStatus.APPLIED, totalRows: parsed.rows.length, appliedRows: prepared.length, completedAt: new Date() },
          include: { errors: true },
        })
      })
    } catch (error) {
      const message = error instanceof BadRequestException ? String(error.message) : 'Score validation failed'
      return this.fail(scoreImport.id, parsed.rows.length, [{ rowNumber: 0, code: 'VALIDATION_FAILED', message }])
    }
  }

  private async fail(importId: string, totalRows: number, errors: CsvError[]) {
    return this.prisma.scoreImport.update({
      where: { id: importId },
      data: {
        status: ImportStatus.FAILED,
        totalRows,
        completedAt: new Date(),
        errors: { create: errors.map((error) => ({ rowNumber: error.rowNumber, code: error.code, message: error.message, rawValue: error.rawValue as object | undefined })) },
      },
      include: { errors: true },
    })
  }

  private parse(source: string) {
    const rows = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map(parseCsvRow)
    const errors: CsvError[] = []
    const cells: ScoreCell[] = []
    const header = rows.shift()
    if (!header || header.join(',') !== 'student_id,subject_id,score,absent') {
      return { rows, cells, errors: [{ rowNumber: 1, code: 'INVALID_HEADER', message: 'CSV header must be student_id,subject_id,score,absent' }] }
    }
    const seen = new Set<string>()
    rows.forEach((row, index) => {
      const rowNumber = index + 2
      if (row.length !== 4) {
        errors.push({ rowNumber, code: 'INVALID_COLUMNS', message: 'CSV row must contain four columns', rawValue: row })
        return
      }
      const [studentEduplusId, subjectId, rawScore, rawAbsent] = row
      const absent = rawAbsent.toLowerCase() === 'true'
      if (!['true', 'false'].includes(rawAbsent.toLowerCase())) errors.push({ rowNumber, code: 'INVALID_ABSENT', message: 'Absent must be true or false', rawValue: row })
      const score = rawScore === '' ? null : Number(rawScore)
      if (score !== null && !Number.isFinite(score)) errors.push({ rowNumber, code: 'INVALID_SCORE', message: 'Score must be numeric', rawValue: row })
      const key = `${studentEduplusId}\u0000${subjectId}`
      if (seen.has(key)) errors.push({ rowNumber, code: 'DUPLICATE_ROW', message: 'Student and subject row is duplicated', rawValue: row })
      seen.add(key)
      cells.push({ studentEduplusId, subjectId, score, absent })
    })
    return { rows, cells, errors }
  }
}

function parseCsvRow(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
    } else if (character === ',' && !quoted) { values.push(value); value = '' } else value += character
  }
  values.push(value)
  return values.map((item) => item.trim())
}
