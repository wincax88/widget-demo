import { INestApplication, UnauthorizedException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request = require('supertest')
import { configureApp } from '../main'
import { SecurityModule } from '../security/security.module'
import { WidgetsController } from './widgets.controller'
import { WidgetAuthService } from './widget-auth.service'
import { WidgetDataService } from './widget-data.service'

describe('widget batch HTTP contract', () => {
  let app: INestApplication
  const auth = { authorize: jest.fn(), refresh: jest.fn() }
  const data = { batch: jest.fn() }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            APP_ORIGIN: 'https://exam.example.com',
            EDUPLUS_WORKBENCH_ORIGIN: 'https://eduplus.example.com',
          })],
        }),
        SecurityModule,
      ],
      controllers: [WidgetsController],
      providers: [
        { provide: WidgetAuthService, useValue: auth },
        { provide: WidgetDataService, useValue: data },
      ],
    }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('forwards one authorized batch and disables response caching', async () => {
    const body = {
      request_id: 'request-1',
      widgets: [{ widget_key: 'exam-score-table', data_endpoint_key: 'exam-score-table' }],
    }
    data.batch.mockResolvedValue({
      request_id: 'request-1', results: { 'exam-score-table': { status: 'ok', data: { rows: [] } } },
    })

    await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/batch-data')
      .set('origin', 'https://eduplus.example.com')
      .set('authorization', 'Bearer signed-widget-token')
      .send(body)
      .expect(201)
      .expect('cache-control', 'no-store')

    expect(data.batch).toHaveBeenCalledWith(body, 'Bearer signed-widget-token')
  })

  it('rejects a missing or invalid bearer token as unauthorized', async () => {
    data.batch.mockRejectedValue(new UnauthorizedException('Bearer access token is required'))
    await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/batch-data')
      .set('origin', 'https://eduplus.example.com')
      .send({ request_id: 'request-1', widgets: [] })
      .expect(401)
  })
})
