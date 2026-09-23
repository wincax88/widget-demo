import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PersonType } from '@prisma/client'
import request = require('supertest')
import { SessionGuard } from '../auth/session.guard'
import { ExamsController } from './exams.controller'
import { ExamsService } from './exams.service'
import { ScoreEntryService } from './score-entry.service'
import { CsvImportService } from './csv-import.service'

describe('examination HTTP lifecycle', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'DRAFT' }),
    list: jest.fn().mockResolvedValue([]),
    detail: jest.fn().mockResolvedValue({ id: 'exam-1' }),
    update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
    publish: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'PUBLISHED' }),
    withdraw: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'WITHDRAWN' }),
  }
  let app: INestApplication

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      controllers: [ExamsController],
      providers: [
        { provide: ExamsService, useValue: service },
        { provide: ScoreEntryService, useValue: { save: jest.fn() } },
        { provide: CsvImportService, useValue: { import: jest.fn() } },
      ],
    })
    const module = await builder.overrideGuard(SessionGuard).useValue({
      canActivate(context: any) {
        context.switchToHttp().getRequest().appSession = {
          tenantId: 'tenant-1',
          personId: 'teacher-1',
          identityType: PersonType.TEACHER,
        }
        return true
      },
    }).compile()
    app = module.createNestApplication<NestExpressApplication>()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()
  })

  afterAll(async () => app.close())

  it('derives actor context from the application session for writes', async () => {
    await request(app.getHttpServer())
      .post('/api/exams')
      .send({
        classroomId: 'class-1', title: 'Midterm', type: 'midterm', examDate: '2026-09-01',
        subjects: [{ courseId: 'math-1', maximumScore: 100 }],
        tenantId: 'attacker-tenant',
      })
      .expect(201)

    expect(service.create).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', personId: 'teacher-1', identityType: PersonType.TEACHER },
      expect.not.objectContaining({ tenantId: expect.anything() }),
    )
  })
})
