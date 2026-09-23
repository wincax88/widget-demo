import { BadRequestException, Controller, Get, INestApplication, Post } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import request = require('supertest')
import { configureApp } from '../main'
import { JsonOnly, SecurityModule, WidgetRoute, redactSecrets } from './security.module'

@Controller()
class SecurityFixtureController {
  @Post('session-write')
  sessionWrite() {
    return { accepted: true }
  }

  @Post('widget-write')
  @WidgetRoute()
  @JsonOnly()
  widgetWrite() {
    return { accepted: true }
  }

  @Get('auth/probe')
  authProbe() {
    return { accepted: true }
  }

  @Post('webhooks/eduplus')
  webhookProbe() {
    return { accepted: true }
  }

  @Get('error-with-secret')
  errorWithSecret() {
    throw new BadRequestException({
      message: 'invalid credentials',
      client_secret: 'secret-value',
      nested: { access_token: 'token-value', safe: 'visible' },
    })
  }
}

describe('shared HTTP security boundaries', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            APP_ORIGIN: 'https://exam.example.com',
            EDUPLUS_WORKBENCH_ORIGIN: 'https://eduplus.example.com',
            AUTH_RATE_LIMIT_MAX: 2,
            WEBHOOK_RATE_LIMIT_MAX: 2,
            RATE_LIMIT_WINDOW_MS: 60_000,
          })],
        }),
        SecurityModule,
      ],
      controllers: [SecurityFixtureController],
    }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  afterAll(async () => app.close())

  it('requires a matching CSRF cookie and header for cookie-authenticated writes', async () => {
    await request(app.getHttpServer())
      .post('/api/session-write')
      .set('cookie', 'widget_demo_session=session; widget_demo_csrf=csrf-one')
      .set('x-csrf-token', 'different')
      .send({})
      .expect(403)

    await request(app.getHttpServer())
      .post('/api/session-write')
      .set('cookie', 'widget_demo_session=session; widget_demo_csrf=csrf-one')
      .set('x-csrf-token', 'csrf-one')
      .send({})
      .expect(201)
  })

  it('accepts widget writes only from configured origins and as JSON', async () => {
    await request(app.getHttpServer())
      .post('/api/widget-write')
      .set('origin', 'https://unknown.example.com')
      .send({})
      .expect(403)

    await request(app.getHttpServer())
      .post('/api/widget-write')
      .set('origin', 'https://eduplus.example.com')
      .type('form')
      .send({ value: 'one' })
      .expect(415)

    await request(app.getHttpServer())
      .post('/api/widget-write')
      .set('origin', 'https://eduplus.example.com')
      .send({ value: 'one' })
      .expect(201)
  })

  it('echoes CORS headers only for configured origins', async () => {
    await request(app.getHttpServer())
      .options('/api/widget-write')
      .set('origin', 'https://exam.example.com')
      .set('access-control-request-method', 'POST')
      .expect('access-control-allow-origin', 'https://exam.example.com')

    const rejected = await request(app.getHttpServer())
      .options('/api/widget-write')
      .set('origin', 'https://unknown.example.com')
      .set('access-control-request-method', 'POST')
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('limits authentication and webhook traffic in independent buckets', async () => {
    await request(app.getHttpServer()).get('/api/auth/probe').expect(200)
    await request(app.getHttpServer()).get('/api/auth/probe').expect(200)
    await request(app.getHttpServer()).get('/api/auth/probe').expect(429)

    await request(app.getHttpServer()).post('/api/webhooks/eduplus').send({}).expect(201)
    await request(app.getHttpServer()).post('/api/webhooks/eduplus').send({}).expect(201)
    await request(app.getHttpServer()).post('/api/webhooks/eduplus').send({}).expect(429)
  })

  it('redacts credential-bearing keys recursively and case-insensitively', () => {
    expect(redactSecrets({
      authorization: 'Bearer secret',
      Cookie: 'session=secret',
      nested: {
        client_secret: 'one',
        handoff_code: 'two',
        access_token: 'three',
        refresh_token: 'four',
        refresh_session_id: 'five',
        safe: 'visible',
      },
    })).toEqual({
      authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      nested: {
        client_secret: '[REDACTED]',
        handoff_code: '[REDACTED]',
        access_token: '[REDACTED]',
        refresh_token: '[REDACTED]',
        refresh_session_id: '[REDACTED]',
        safe: 'visible',
      },
    })
  })

  it('redacts credential-bearing keys from HTTP error responses', async () => {
    await request(app.getHttpServer())
      .get('/api/error-with-secret')
      .expect(400)
      .expect({
        message: 'invalid credentials',
        client_secret: '[REDACTED]',
        nested: { access_token: '[REDACTED]', safe: 'visible' },
      })
  })
})
