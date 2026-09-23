import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request = require('supertest')
import { configureApp } from '../main'
import { SecurityModule } from '../security/security.module'
import { WidgetAuthService } from './widget-auth.service'
import { WidgetsController } from './widgets.controller'
import { WidgetDataService } from './widget-data.service'

describe('widget auth HTTP contract', () => {
  let app: INestApplication
  const auth = {
    authorize: jest.fn(),
    refresh: jest.fn(),
  }

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
        { provide: WidgetDataService, useValue: { batch: jest.fn() } },
      ],
    }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('accepts the exact workbench auth body and disables response caching', async () => {
    auth.authorize.mockResolvedValue({
      access_token: 'access-one', token_type: 'Bearer', expires_in: 300,
      scope: 'widget.data.read', refresh_session_id: 'session-one', refresh_after: 240,
    })
    const body = {
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'handoff-code', idempotency_key: 'request-one',
    }

    const response = await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/auth')
      .set('origin', 'https://eduplus.example.com')
      .send(body)
      .expect(201)
      .expect('cache-control', 'no-store')

    expect(auth.authorize).toHaveBeenCalledWith(body)
    expect(response.body).not.toHaveProperty('refresh_token')
  })

  it('forwards the current bearer token to refresh and disables response caching', async () => {
    auth.refresh.mockResolvedValue({
      access_token: 'access-two', token_type: 'Bearer', expires_in: 300,
      scope: 'widget.data.read', refresh_session_id: 'session-one', refresh_after: 240,
    })
    const body = {
      grant_type: 'eduplus_widget_token_refresh', refresh_session_id: 'session-one',
      request_id: 'request-two',
    }

    await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/token/refresh')
      .set('origin', 'https://eduplus.example.com')
      .set('authorization', 'Bearer access-one')
      .send(body)
      .expect(201)
      .expect('cache-control', 'no-store')

    expect(auth.refresh).toHaveBeenCalledWith(body, 'Bearer access-one')
  })

  it('applies the widget origin and JSON-only boundary to auth endpoints', async () => {
    await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/auth')
      .set('origin', 'https://unknown.example.com')
      .send({})
      .expect(403)

    await request(app.getHttpServer())
      .post('/v1/open/demo-school/widgets/auth')
      .set('origin', 'https://eduplus.example.com')
      .type('form')
      .send({ grant_type: 'eduplus_widget_handoff' })
      .expect(415)
  })
})
