import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { NestExpressApplication } from '@nestjs/platform-express'
import { CredentialKind, PersonType, PrismaClient, TenantStatus } from '@prisma/client'
import request = require('supertest')
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { HandoffClient } from '../integration/eduplus/handoff-client'
import { OidcVerifier } from '../integration/eduplus/oidc-verifier'
import { configureApp } from '../main'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthModule } from './auth.module'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('application authentication', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const tenantCode = `auth-${globalThis.crypto.randomUUID()}`
  const tenantExternalId = `edu-${globalThis.crypto.randomUUID()}`
  const tokens = {
    access_token: 'access-secret',
    id_token: 'id-secret',
    refresh_token: 'refresh-secret',
    token_type: 'Bearer',
    expires_in: 900,
    refresh_expires_in: 1800,
  }
  const handoff = { exchange: jest.fn().mockResolvedValue(tokens) }
  const verifier = {
    verify: jest.fn().mockResolvedValue({
      sub: 'user-1',
      tenantId: tenantExternalId,
      identityId: 'teacher-1',
      identityType: PersonType.TEACHER,
      clientId: `client-${tenantCode}`,
      handoffType: 'app_launch',
    }),
  }
  let app: INestApplication

  beforeAll(async () => {
    await prisma.$connect()
    const tenant = await prisma.tenant.create({
      data: {
        code: tenantCode,
        eduplusTenantId: tenantExternalId,
        name: 'Auth School',
        status: TenantStatus.ACTIVE,
        issuerUrl: 'https://issuer.example.com/realms/eduplus',
      },
    })
    const crypto = new CredentialCryptoService(
      new (await import('@nestjs/config')).ConfigService({
        CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
      }),
    )
    await prisma.tenantCredential.create({
      data: {
        tenantId: tenant.id,
        kind: CredentialKind.OAUTH_CLIENT_SECRET,
        clientId: `client-${tenantCode}`,
        ...crypto.encrypt('client-secret'),
      },
    })

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
    })
      .overrideProvider(HandoffClient)
      .useValue(handoff)
      .overrideProvider(OidcVerifier)
      .useValue(verifier)
      .compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await prisma.tenant.deleteMany({ where: { code: tenantCode } })
    await prisma.$disconnect()
  })

  it('sets only an opaque secure application-session cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/handoff')
      .send({ tenant_code: tenantCode, code: 'one-time-code' })
      .expect(201)

    expect(response.body).toEqual({ authenticated: true })
    expect(JSON.stringify(response.body)).not.toContain('access-secret')
    expect(JSON.stringify(response.body)).not.toContain('refresh-secret')
    expect(response.headers['set-cookie'][0]).toMatch(
      /^widget_demo_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax/,
    )
    expect(await prisma.appSession.count({ where: { tenant: { code: tenantCode } } })).toBe(1)
  })

  it('creates no session when verified tenant claims do not match', async () => {
    const before = await prisma.appSession.count({ where: { tenant: { code: tenantCode } } })
    verifier.verify.mockResolvedValueOnce({
      sub: 'user-1',
      tenantId: 'another-tenant',
      identityId: 'teacher-1',
      identityType: PersonType.TEACHER,
      clientId: `client-${tenantCode}`,
      handoffType: 'app_launch',
    })

    await request(app.getHttpServer())
      .post('/api/auth/handoff')
      .send({ tenant_code: tenantCode, code: 'bad-code' })
      .expect(401)

    expect(await prisma.appSession.count({ where: { tenant: { code: tenantCode } } })).toBe(before)
  })
})
