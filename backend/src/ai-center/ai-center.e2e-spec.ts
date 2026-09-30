import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import request = require('supertest')
import { AiCenterModule } from './ai-center.module'
import { AuthService } from '../auth/auth.service'
import { configureApp } from '../main'
import { SecurityModule } from '../security/security.module'

const input = { messages: [{ role: 'user', content: '你好' }] }
const session = { tenantId: 'tenant-1', personId: 'person-1', identityType: 'STUDENT' }
const cookie = 'widget_demo_session=valid-session; widget_demo_csrf=csrf-one'

describe('authenticated AI Center routes', () => {
  let app: INestApplication
  const findSession = jest.fn()
  let fetchMock: jest.SpyInstance

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({
        APP_ORIGIN: 'https://exam.example.com', EDUPLUS_WORKBENCH_ORIGIN: 'https://eduplus.example.com',
        AI_CENTER_BASE_URL: 'https://ai.example.com', AI_CENTER_API_KEY: 'key-canary', AI_CENTER_TIMEOUT_MS: 10000,
      })] }), SecurityModule, AiCenterModule],
    }).overrideProvider(AuthService).useValue({ findSession }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  beforeEach(() => {
    findSession.mockImplementation(async (id: string) => id === 'valid-session' ? session : null)
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      model: 'model-a', choices: [{ message: { role: 'assistant', content: '你好！' }, finish_reason: 'stop' }],
      usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 }, api_key_id: 'private-key-id',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
  })
  afterEach(() => jest.restoreAllMocks())
  afterAll(async () => app.close())

  it('denies unauthenticated status and chat without calling AI Center', async () => {
    await request(app.getHttpServer()).get('/api/ai-center/status').expect(401)
    await request(app.getHttpServer()).post('/api/ai-center/chat').send(input).expect(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes readiness only to the authenticated session and never exposes the Key', async () => {
    await request(app.getHttpServer()).get('/api/ai-center/status').set('cookie', cookie)
      .expect(200).expect({ configured: true, defaultModel: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires CSRF protection for model invocations', async () => {
    await request(app.getHttpServer()).post('/api/ai-center/chat').set('cookie', cookie).send(input).expect(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['STAFF', 'TEACHER', 'STUDENT', 'PARENT'])('allows a %s session to send a bounded text conversation', async (role) => {
    findSession.mockResolvedValue({ ...session, identityType: role })
    const response = await send(input).expect(200)
    expect(response.body).toMatchObject({ content: '你好！', model: 'model-a', finish_reason: 'stop' })
    expect(JSON.stringify(response.body)).not.toContain('private-key-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    {}, { messages: [] }, { messages: [{ role: 'user', content: '   ' }] },
    { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: ['x'] }] },
    { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
    { messages: Array.from({ length: 33 }, () => ({ role: 'user', content: 'x' })) },
    { messages: Array.from({ length: 5 }, () => ({ role: 'user', content: 'x'.repeat(8000) })) },
    { ...input, max_tokens: 0 }, { ...input, max_tokens: 4097 }, { ...input, max_tokens: 2.5 },
    { ...input, max_tokens: '512' }, { ...input, temperature: -0.1 }, { ...input, temperature: 2.1 },
    { ...input, model: ' ' }, { ...input, model: 'x'.repeat(129) }, { ...input, stream: true },
    { ...input, api_key: 'private-canary' }, { messages: [{ role: 'user', content: 'x', file_id: 'private-canary' }] },
    { ...input, model: null }, { ...input, max_tokens: null }, { ...input, temperature: null },
  ])('rejects invalid input %# before contacting the upstream', async (body) => {
    await send(body).expect(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the supported text roles and optional parameters', async () => {
    await send({ messages: [{ role: 'system', content: '请简短回答' }, { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }, { role: 'user', content: '再说一句' }], model: 'model-a', max_tokens: 128, temperature: 0 }).expect(200)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ max_tokens: 128, temperature: 0, model: 'model-a' })
    expect(body.messages).toHaveLength(4)
  })

  it('requires JSON for chat requests', async () => {
    await request(app.getHttpServer()).post('/api/ai-center/chat').set('cookie', cookie).set('x-csrf-token', 'csrf-one')
      .type('form').send({ messages: 'x' }).expect(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  function send(body: object) {
    return request(app.getHttpServer()).post('/api/ai-center/chat').set('cookie', cookie).set('x-csrf-token', 'csrf-one').send(body)
  }
})
