import { createHmac } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import { CredentialKind, PrismaClient, TenantStatus } from '@prisma/client'
import request = require('supertest')
import { AppModule } from '../app.module'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { configureApp } from '../main'
import { SubscriptionsService } from './subscriptions.service'
import { WebhookSignatureService } from './webhook-signature.service'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('subscription webhook lifecycle', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const webhookSecret = process.env.EDUPLUS_WEBHOOK_SECRET!
  const encryptionKey = Buffer.alloc(32, 9).toString('base64url')
  const config = new ConfigService({
    EDUPLUS_WEBHOOK_SECRET: webhookSecret,
    CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
  })
  const crypto = new CredentialCryptoService(config)
  const service = new SubscriptionsService(
    prisma as never,
    new WebhookSignatureService(config),
    crypto,
  )
  const tenantCode = `school-${cryptoRandomId()}`
  const endpointTenantCode = `endpoint-${cryptoRandomId()}`
  let app: INestApplication

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.CREDENTIAL_ENCRYPTION_KEY = encryptionKey
    process.env.EDUPLUS_WEBHOOK_SECRET = webhookSecret
    process.env.EDUPLUS_BASE_URL = 'https://eduplus.example.com'
    process.env.EDUPLUS_WORKBENCH_ORIGIN = 'https://eduplus.example.com'
    process.env.APP_ORIGIN = 'https://exam.example.com'
    await prisma.$connect()
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })
  afterAll(async () => {
    await app.close()
    await prisma.tenant.deleteMany({ where: { code: { in: [tenantCode, endpointTenantCode] } } })
    await prisma.$disconnect()
  })

  it('accepts a correctly signed raw request through the controller', async () => {
    const payload = event('subscription.created', {
      tenant: { id: `edu-${endpointTenantCode}`, code: endpointTenantCode, name: 'Endpoint School' },
      oauth_client: {
        client_id: `client-${endpointTenantCode}`,
        client_secret: 'endpoint-secret',
      },
    })
    const rawBody = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.subscription.created.${rawBody}`)
      .digest('hex')

    await request(app.getHttpServer())
      .post('/api/webhooks/eduplus')
      .set('content-type', 'application/json')
      .set('x-eduplus-timestamp', timestamp)
      .set('x-eduplus-event', 'subscription.created')
      .set('x-eduplus-signature', `sha256=${signature}`)
      .send(rawBody)
      .expect(200)
      .expect({ accepted: true, duplicate: false })

    await request(app.getHttpServer())
      .post('/api/webhooks/eduplus')
      .set('content-type', 'application/json')
      .set('x-eduplus-timestamp', timestamp)
      .set('x-eduplus-event', 'subscription.created')
      .set('x-eduplus-signature', `sha256=${'0'.repeat(64)}`)
      .send(rawBody)
      .expect(401)
  })

  const receive = (payload: Record<string, unknown>) => {
    const rawBody = Buffer.from(JSON.stringify(payload))
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const eventName = String(payload.event)
    const signature = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${eventName}.${rawBody.toString('utf8')}`)
      .digest('hex')
    return service.receive(rawBody, {
      'x-eduplus-timestamp': timestamp,
      'x-eduplus-event': eventName,
      'x-eduplus-signature': `sha256=${signature}`,
    })
  }

  it('applies create, duplicate, suspend, rotate and revoke idempotently', async () => {
    const created = event('subscription.created', {
      oauth_client: {
        client_id: `client-${tenantCode}`,
        client_secret: 'initial-secret',
        auth_server_url: 'https://issuer.example.com',
      },
    })

    expect(await receive(created)).toEqual({ accepted: true, duplicate: false })
    expect(await receive(created)).toEqual({ accepted: true, duplicate: true })

    let tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: tenantCode } })
    expect(tenant.status).toBe(TenantStatus.ACTIVE)
    let credential = await prisma.tenantCredential.findUniqueOrThrow({
      where: { tenantId_kind: { tenantId: tenant.id, kind: CredentialKind.OAUTH_CLIENT_SECRET } },
    })
    expect(crypto.decrypt(credential)).toBe('initial-secret')

    await receive(event('subscription.suspended'))
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: tenantCode } })
    expect(tenant.status).toBe(TenantStatus.SUSPENDED)

    await receive(event('credential.rotated', {
      credential: { client_id: `client-${tenantCode}`, new_secret: 'rotated-secret' },
    }))
    credential = await prisma.tenantCredential.findUniqueOrThrow({
      where: { tenantId_kind: { tenantId: tenant.id, kind: CredentialKind.OAUTH_CLIENT_SECRET } },
    })
    expect(crypto.decrypt(credential)).toBe('rotated-secret')

    await receive(event('credential.revoked', {
      credential: { client_id: `client-${tenantCode}` },
    }))
    credential = await prisma.tenantCredential.findUniqueOrThrow({
      where: { tenantId_kind: { tenantId: tenant.id, kind: CredentialKind.OAUTH_CLIENT_SECRET } },
    })
    expect(credential.revokedAt).not.toBeNull()
  })

  function event(name: string, extra: Record<string, unknown> = {}) {
    return {
      event: name,
      event_id: cryptoRandomId(),
      timestamp: Math.floor(Date.now() / 1000),
      tenant: { id: `edu-${tenantCode}`, code: tenantCode, name: 'Integration School' },
      app: { code: 'exam-results' },
      subscription: { status: name === 'subscription.suspended' ? 'suspended' : 'active' },
      ...extra,
    }
  }
})

function cryptoRandomId() {
  return globalThis.crypto.randomUUID()
}
