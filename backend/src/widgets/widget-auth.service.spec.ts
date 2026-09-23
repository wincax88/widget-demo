import { ConfigService } from '@nestjs/config'
import { HttpException } from '@nestjs/common'
import { TenantStatus } from '@prisma/client'
import { createHash } from 'node:crypto'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { WidgetAuthService } from './widget-auth.service'

describe('WidgetAuthService', () => {
  const credential = {
    id: 'credential-1', tenantId: 'tenant-local-1', clientId: 'oc_tenant_1',
    ciphertext: Buffer.from('cipher'), iv: Buffer.from('iv'), authenticationTag: Buffer.from('tag'),
    tenant: {
      id: 'tenant-local-1', eduplusTenantId: '42', status: TenantStatus.ACTIVE,
      issuerUrl: 'https://issuer.example/realms/tenant-1',
      jwksUri: 'https://issuer.example/realms/tenant-1/certs',
      tokenEndpoint: 'https://issuer.example/realms/tenant-1/token',
    },
  }
  const verified = {
    sub: 'keycloak-user', tenantId: '42', identityId: 'student-42', identityType: 'STUDENT',
    clientId: 'oc_tenant_1', handoffType: 'widget_data', appCode: 'demo-school',
    configSnapshotId: 'snapshot-1', scope: 'widget.data.read',
    widgetKeys: ['exam-score-table'], dataEndpointKeys: ['exam-score-table'],
    endpointPairs: [{ widgetKey: 'exam-score-table', dataEndpointKey: 'exam-score-table' }],
  }
  const tokenResponse = {
    access_token: 'access-one', refresh_token: 'refresh-one', token_type: 'Bearer',
    expires_in: 300, refresh_expires_in: 1800, scope: 'widget.data.read',
  }

  const create = () => {
    let prisma: any
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) => callback(prisma)),
      tenantCredential: { findMany: jest.fn().mockResolvedValue([credential]) },
      widgetAuthExchange: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      widgetRefreshSession: { findUnique: jest.fn() },
    }
    const crypto = {
      decrypt: jest.fn().mockReturnValue('client-secret'),
      encrypt: jest.fn().mockReturnValue({
        ciphertext: Buffer.from('response'), iv: Buffer.alloc(12), authenticationTag: Buffer.alloc(16),
      }),
    }
    const handoff = {
      exchange: jest.fn().mockResolvedValue(tokenResponse),
      refresh: jest.fn(),
    }
    const verifier = { verifyWidget: jest.fn().mockResolvedValue(verified) }
    const sessions = {
      create: jest.fn().mockResolvedValue({ id: 'refresh-session-1' }),
      load: jest.fn(),
      rotate: jest.fn(),
    }
    const config = new ConfigService({
      EDUPLUS_BASE_URL: 'https://eduplus.example', EDUPLUS_APP_CODE: 'demo-school',
    })
    const service = new WidgetAuthService(
      prisma as never,
      config,
      crypto as unknown as CredentialCryptoService,
      handoff as never,
      verifier as never,
      sessions as never,
    )
    return { service, prisma, crypto, handoff, verifier, sessions }
  }

  it.each([
    [{ grant_type: 'eduplus_widget_handoff', handoff_code: 'code', idempotency_key: 'idem' }],
    [{ grant_type: 'eduplus_widget_handoff', client_id: '', handoff_code: 'code', idempotency_key: 'idem' }],
  ])('rejects a missing client ID without attempting exchange', async (input) => {
    const { service, handoff } = create()
    await expect(service.authorize(input as never)).rejects.toThrow('client_id')
    expect(handoff.exchange).not.toHaveBeenCalled()
  })

  it('rejects an unknown or ambiguous exact client ID', async () => {
    const { service, prisma, handoff } = create()
    prisma.tenantCredential.findMany.mockResolvedValue([])
    await expect(service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'unknown',
      handoff_code: 'code', idempotency_key: 'idem',
    })).rejects.toThrow('Widget OAuth client is unavailable')
    expect(prisma.tenantCredential.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }))
    expect(handoff.exchange).not.toHaveBeenCalled()
  })

  it('exchanges with the selected HMAC credential and never returns the refresh token', async () => {
    const { service, prisma, crypto, handoff, verifier, sessions } = create()
    const response = await service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'handoff-code', idempotency_key: 'idem-1',
    })

    expect(crypto.decrypt).toHaveBeenCalledWith(credential)
    expect(handoff.exchange).toHaveBeenCalledWith({
      baseUrl: 'https://eduplus.example', clientId: 'oc_tenant_1',
      clientSecret: 'client-secret', code: 'handoff-code',
    })
    expect(verifier.verifyWidget).toHaveBeenCalledWith('access-one', expect.objectContaining({
      issuer: credential.tenant.issuerUrl, clientId: 'oc_tenant_1', appCode: 'demo-school',
    }))
    expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'access-one', refreshToken: 'refresh-one',
      context: expect.objectContaining({
        tenantId: 'tenant-local-1', userId: 'keycloak-user', appCode: 'demo-school',
        identityId: 'student-42', scope: 'widget.data.read',
        authorization: {
          widgetKeys: ['exam-score-table'], dataEndpointKeys: ['exam-score-table'],
          endpointPairs: [{ widgetKey: 'exam-score-table', dataEndpointKey: 'exam-score-table' }],
        },
      }),
    }), expect.anything())
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      access_token: 'access-one', token_type: 'Bearer', expires_in: 300,
      scope: 'widget.data.read', refresh_session_id: 'refresh-session-1', refresh_after: 240,
    })
    expect(response).not.toHaveProperty('refresh_token')
  })

  it('rejects a token whose signed tenant does not match the selected credential', async () => {
    const { service, verifier, sessions } = create()
    verifier.verifyWidget.mockResolvedValue({ ...verified, tenantId: 'other-tenant' })
    await expect(service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'code', idempotency_key: 'idem',
    })).rejects.toThrow('Widget token context does not match the selected tenant')
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('keeps the durable reservation when the post-exchange database transaction fails', async () => {
    const { service, prisma } = create()
    prisma.$transaction.mockRejectedValue(new Error('database transaction failed'))

    await expect(service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'consumed-code', idempotency_key: 'idem-transaction',
    })).rejects.toThrow('database transaction failed')
    expect(prisma.widgetAuthExchange.deleteMany).not.toHaveBeenCalled()
  })

  it('returns a completed idempotent replay without exchanging the one-time code again', async () => {
    const { service, prisma, crypto, handoff } = create()
    const replay = {
      access_token: 'access-replay', token_type: 'Bearer', expires_in: 250,
      scope: 'widget.data.read', refresh_session_id: 'refresh-session-1', refresh_after: 190,
    }
    prisma.widgetAuthExchange.findUnique.mockResolvedValue({
      keyHash: 'stored', clientId: 'oc_tenant_1',
      requestHash: createHash('sha256')
        .update('eduplus_widget_handoff\0oc_tenant_1\0same-code', 'utf8').digest('base64url'),
      responseCiphertext: Buffer.from('response'),
      responseIv: Buffer.alloc(12), responseTag: Buffer.alloc(16), expiresAt: new Date(Date.now() + 60_000),
    })
    crypto.decrypt.mockReturnValue(JSON.stringify(replay))

    await expect(service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'same-code', idempotency_key: 'same-key',
    })).resolves.toEqual(replay)
    expect(handoff.exchange).not.toHaveBeenCalled()
  })

  it('rejects reuse of an idempotency key for a different handoff code', async () => {
    const { service, prisma, handoff } = create()
    prisma.widgetAuthExchange.findUnique.mockResolvedValue({
      keyHash: 'stored', clientId: 'oc_tenant_1', requestHash: 'different-request',
      responseCiphertext: Buffer.from('response'), responseIv: Buffer.alloc(12),
      responseTag: Buffer.alloc(16), expiresAt: new Date(Date.now() + 60_000),
    })

    await expect(service.authorize({
      grant_type: 'eduplus_widget_handoff', client_id: 'oc_tenant_1',
      handoff_code: 'new-code', idempotency_key: 'same-key',
    })).rejects.toThrow('Idempotency key belongs to another request')
    expect(handoff.exchange).not.toHaveBeenCalled()
  })

  it('refreshes only the exact access-token-bound session and rotates server-side tokens', async () => {
    const { service, prisma, handoff, verifier, sessions } = create()
    prisma.widgetRefreshSession.findUnique.mockResolvedValue({
      id: 'refresh-session-1', tenantId: 'tenant-local-1',
      tenant: { ...credential.tenant, credentials: [credential] },
    })
    sessions.load.mockResolvedValue({
      id: 'refresh-session-1', refreshToken: 'refresh-one',
      expiresAt: new Date(Date.now() + 1_000_000),
      context: {
        tenantId: 'tenant-local-1', userId: verified.sub, identityId: verified.identityId,
        identityType: verified.identityType, scope: verified.scope,
        appCode: verified.appCode, configSnapshotId: verified.configSnapshotId,
        authorization: {
          widgetKeys: verified.widgetKeys, dataEndpointKeys: verified.dataEndpointKeys,
          endpointPairs: verified.endpointPairs,
        },
      },
    })
    handoff.refresh.mockResolvedValue({
      access_token: 'access-two', refresh_token: 'refresh-two', token_type: 'Bearer',
      expires_in: 300, refresh_expires_in: 1800, scope: 'widget.data.read',
    })
    verifier.verifyWidget
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce(verified)

    const response = await service.refresh({
      grant_type: 'eduplus_widget_token_refresh', refresh_session_id: 'refresh-session-1',
      request_id: 'request-1',
    }, 'Bearer access-one')

    expect(verifier.verifyWidget).toHaveBeenNthCalledWith(1, 'access-one', expect.objectContaining({
      clockToleranceSeconds: 90,
    }))
    expect(sessions.load).toHaveBeenCalledWith('refresh-session-1', 'access-one', expect.any(Object))
    expect(handoff.refresh).toHaveBeenCalledWith({
      tokenEndpoint: credential.tenant.tokenEndpoint,
      clientId: 'oc_tenant_1', clientSecret: 'client-secret', refreshToken: 'refresh-one',
    })
    expect(sessions.rotate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'refresh-session-1', currentAccessToken: 'access-one',
      newAccessToken: 'access-two', newRefreshToken: 'refresh-two',
    }))
    expect(response).toEqual({
      access_token: 'access-two', token_type: 'Bearer', expires_in: 300,
      scope: 'widget.data.read', refresh_session_id: 'refresh-session-1', refresh_after: 240,
    })
    expect(response).not.toHaveProperty('refresh_token')
  })

  it('rejects a wrong current bearer token before calling the refresh grant', async () => {
    const { service, prisma, handoff, verifier } = create()
    prisma.widgetRefreshSession.findUnique.mockResolvedValue({
      id: 'refresh-session-1', tenantId: 'tenant-local-1',
      tenant: { ...credential.tenant, credentials: [credential] },
    })
    verifier.verifyWidget.mockRejectedValue(new Error('invalid token'))

    await expect(service.refresh({
      grant_type: 'eduplus_widget_token_refresh', refresh_session_id: 'refresh-session-1',
      request_id: 'request-1',
    }, 'Bearer wrong-access')).rejects.toThrow()
    expect(handoff.refresh).not.toHaveBeenCalled()
  })

  it('rejects refreshed claims that widen or change the original context', async () => {
    const { service, prisma, handoff, verifier, sessions } = create()
    prisma.widgetRefreshSession.findUnique.mockResolvedValue({
      id: 'refresh-session-1', tenantId: 'tenant-local-1',
      tenant: { ...credential.tenant, credentials: [credential] },
    })
    sessions.load.mockResolvedValue({
      id: 'refresh-session-1', refreshToken: 'refresh-one', expiresAt: new Date(Date.now() + 1_000_000),
      context: {
        tenantId: 'tenant-local-1', userId: verified.sub, identityId: verified.identityId,
        identityType: verified.identityType, scope: verified.scope,
        appCode: verified.appCode, configSnapshotId: verified.configSnapshotId,
        authorization: {
          widgetKeys: verified.widgetKeys, dataEndpointKeys: verified.dataEndpointKeys,
          endpointPairs: verified.endpointPairs,
        },
      },
    })
    handoff.refresh.mockResolvedValue({
      access_token: 'access-two', refresh_token: 'refresh-two', token_type: 'Bearer',
      expires_in: 300, scope: 'widget.data.read',
    })
    verifier.verifyWidget
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce({ ...verified, widgetKeys: [...verified.widgetKeys, 'exam-score-trend'] })

    await expect(service.refresh({
      grant_type: 'eduplus_widget_token_refresh', refresh_session_id: 'refresh-session-1',
      request_id: 'request-1',
    }, 'Bearer access-one')).rejects.toThrow('Refreshed widget token context changed')
    expect(sessions.rotate).not.toHaveBeenCalled()
  })

  it('maps an expired refresh session to unauthorized instead of an internal error', async () => {
    const { service, prisma, verifier, sessions } = create()
    prisma.widgetRefreshSession.findUnique.mockResolvedValue({
      id: 'refresh-session-1', tenantId: 'tenant-local-1',
      tenant: { ...credential.tenant, credentials: [credential] },
    })
    verifier.verifyWidget.mockResolvedValue(verified)
    sessions.load.mockRejectedValue(Object.assign(new Error('SESSION_EXPIRED'), {
      name: 'WidgetSessionError', code: 'SESSION_EXPIRED',
    }))

    const error = await service.refresh({
      grant_type: 'eduplus_widget_token_refresh', refresh_session_id: 'refresh-session-1',
      request_id: 'request-1',
    }, 'Bearer access-one').catch((caught) => caught)
    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(401)
  })
})
