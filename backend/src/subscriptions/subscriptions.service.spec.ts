import { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { SubscriptionsService } from './subscriptions.service'
import { WebhookSignatureService } from './webhook-signature.service'

describe('SubscriptionsService OIDC configuration', () => {
  it('stores the realm issuer from the token endpoint instead of the auth server origin', async () => {
    const config = new ConfigService({
      EDUPLUS_WEBHOOK_SECRET: 'test-webhook-secret',
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64url'),
    })
    const upsert = jest.fn().mockResolvedValue({ id: 'tenant-1' })
    const transaction = {
      webhookReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: { upsert },
      tenantCredential: { upsert: jest.fn().mockResolvedValue({}) },
    }
    const prisma = { $transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction) }
    const service = new SubscriptionsService(
      prisma as never,
      new WebhookSignatureService(config),
      new CredentialCryptoService(config),
    )
    const payload = {
      event: 'subscription.created',
      event_id: 'event-1',
      tenant: { id: 216, code: 'main09', name: 'Main School' },
      oauth_client: {
        client_id: 'client-1',
        client_secret: 'secret-1',
        auth_server_url: 'https://eduplus-auth-test.f123.pub',
        token_endpoint: 'https://eduplus-auth-test.f123.pub/realms/eduplus/protocol/openid-connect/token',
        jwks_uri: 'https://eduplus-auth-test.f123.pub/realms/eduplus/protocol/openid-connect/certs',
      },
    }
    const rawBody = Buffer.from(JSON.stringify(payload))
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createHmac('sha256', 'test-webhook-secret')
      .update(`${timestamp}.${payload.event}.${rawBody.toString('utf8')}`)
      .digest('hex')

    await service.receive(rawBody, {
      'x-eduplus-timestamp': timestamp,
      'x-eduplus-event': payload.event,
      'x-eduplus-signature': `sha256=${signature}`,
    })

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ issuerUrl: 'https://eduplus-auth-test.f123.pub/realms/eduplus' }),
      update: expect.objectContaining({ issuerUrl: 'https://eduplus-auth-test.f123.pub/realms/eduplus' }),
    }))
  })
})
