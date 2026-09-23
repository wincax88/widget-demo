import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import {
  WidgetRefreshSessionService,
  WidgetAuthorizationSnapshot,
  WidgetSessionContext,
  WidgetSessionError,
} from './widget-refresh-session.service'

describe('WidgetRefreshSessionService', () => {
  const prisma = new PrismaClient()
  const crypto = new CredentialCryptoService(new ConfigService({
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64url'),
  }))
  const service = new WidgetRefreshSessionService(prisma as never, crypto)
  const runId = `${Date.now()}-${Math.random()}`
  let tenantId: string
  const context = (): WidgetSessionContext => ({
    tenantId,
    userId: 'eduplus-user-1',
    identityType: 'student',
    appCode: 'exam-results',
    configSnapshotId: 'snapshot-1',
    authorization: {
      widgetKeys: ['exam-latest-summary', 'exam-score-table'],
      dataEndpointKeys: ['results-self'],
      endpointPairs: [
        { widgetKey: 'exam-latest-summary', dataEndpointKey: 'results-self' },
        { widgetKey: 'exam-score-table', dataEndpointKey: 'results-self' },
      ],
    },
  })

  beforeAll(async () => {
    await prisma.$connect()
    tenantId = (await prisma.tenant.create({
      data: { code: `widget-session-${runId}`, name: 'Widget Session School' },
    })).id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it('stores opaque IDs, hashes access tokens and encrypts refresh tokens', async () => {
    const created = await service.create({
      context: context(),
      accessToken: 'access-token-plain',
      refreshToken: 'refresh-token-plain',
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    const stored = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: created.id } })
    expect(stored.accessTokenHash).not.toContain('access-token-plain')
    expect(Buffer.from(stored.refreshTokenCiphertext).toString()).not.toContain('refresh-token-plain')

    const loaded = await service.load(created.id, 'access-token-plain', context())
    expect(loaded.refreshToken).toBe('refresh-token-plain')
    expect(loaded.context).toEqual(context())
  })

  it.each([
    ['tenantId', 'other-tenant'],
    ['userId', 'other-user'],
    ['identityType', 'parent'],
    ['appCode', 'other-app'],
    ['configSnapshotId', 'other-snapshot'],
  ] as const)('rejects a mismatched %s binding', async (field, value) => {
    const created = await createSession()
    await expect(service.load(created.id, 'access-old', { ...context(), [field]: value }))
      .rejects.toMatchObject({ code: 'SESSION_CONTEXT_MISMATCH' })
  })

  it.each([
    ['widget keys', { widgetKeys: ['exam-score-trend'] }],
    ['endpoint keys', { dataEndpointKeys: ['other-endpoint'] }],
    ['widget/endpoint pairs', { endpointPairs: [{ widgetKey: 'exam-latest-summary', dataEndpointKey: 'other-endpoint' }] }],
  ] as Array<[string, Partial<WidgetAuthorizationSnapshot>]>)('binds the exact authorization %s', async (_label, mutation) => {
    const created = await createSession()
    const changed = context()
    changed.authorization = {
      ...changed.authorization,
      ...mutation,
    }
    await expect(service.load(created.id, 'access-old', changed))
      .rejects.toMatchObject({ code: 'SESSION_CONTEXT_MISMATCH' })
  })

  it('rejects ciphertext moved from another session even when the context matches', async () => {
    const first = await service.create({
      context: context(), accessToken: 'access-first', refreshToken: 'refresh-first',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const second = await service.create({
      context: context(), accessToken: 'access-second', refreshToken: 'refresh-second',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const secondRow = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: second.id } })
    await prisma.widgetRefreshSession.update({
      where: { id: first.id },
      data: {
        refreshTokenCiphertext: secondRow.refreshTokenCiphertext,
        refreshTokenIv: secondRow.refreshTokenIv,
        refreshTokenTag: secondRow.refreshTokenTag,
      },
    })

    await expect(service.load(first.id, 'access-first', context()))
      .rejects.toMatchObject({ code: 'SESSION_INTEGRITY_FAILED' })
  })

  it('rejects expired and revoked sessions', async () => {
    const expired = await service.create({
      context: context(), accessToken: 'expired-access', refreshToken: 'expired-refresh',
      expiresAt: new Date(Date.now() - 1_000),
    })
    await expect(service.load(expired.id, 'expired-access', context()))
      .rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    const expiredBefore = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: expired.id } })
    await expect(service.rotate({
      id: expired.id, currentAccessToken: 'expired-access', context: context(),
      newAccessToken: 'new-expired-access', newRefreshToken: 'new-expired-refresh',
    })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    const expiredAfter = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: expired.id } })
    expect(expiredAfter.accessTokenHash).toBe(expiredBefore.accessTokenHash)
    expect(expiredAfter.refreshTokenCiphertext).toEqual(expiredBefore.refreshTokenCiphertext)

    const revoked = await createSession()
    await service.revoke(revoked.id, context())
    await expect(service.load(revoked.id, 'access-old', context()))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const revokedBefore = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: revoked.id } })
    await expect(service.rotate({
      id: revoked.id, currentAccessToken: 'access-old', context: context(),
      newAccessToken: 'new-revoked-access', newRefreshToken: 'new-revoked-refresh',
    })).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    const revokedAfter = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: revoked.id } })
    expect(revokedAfter.accessTokenHash).toBe(revokedBefore.accessTokenHash)
    expect(revokedAfter.refreshTokenCiphertext).toEqual(revokedBefore.refreshTokenCiphertext)
  })

  it('rotates tokens with compare-and-swap so a concurrent loser cannot overwrite the winner', async () => {
    const created = await createSession()
    const attempts = await Promise.allSettled([
      service.rotate({ id: created.id, currentAccessToken: 'access-old', context: context(), newAccessToken: 'access-a', newRefreshToken: 'refresh-a' }),
      service.rotate({ id: created.id, currentAccessToken: 'access-old', context: context(), newAccessToken: 'access-b', newRefreshToken: 'refresh-b' }),
    ])

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = attempts.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejected?.reason).toBeInstanceOf(WidgetSessionError)
    expect(rejected?.reason).toMatchObject({ code: 'SESSION_CONFLICT' })
    const winner = attempts.find((result): result is PromiseFulfilledResult<{ id: string; accessToken: string }> => result.status === 'fulfilled')!
    const loaded = await service.load(created.id, winner.value.accessToken, context())
    expect(loaded.refreshToken).toBe(winner.value.accessToken === 'access-a' ? 'refresh-a' : 'refresh-b')
    const stored = await prisma.widgetRefreshSession.findUniqueOrThrow({ where: { id: created.id } })
    expect(stored.accessTokenHash).not.toContain(winner.value.accessToken)
    expect(Buffer.from(stored.refreshTokenCiphertext).toString()).not.toContain(loaded.refreshToken)
    await expect(service.load(created.id, 'access-old', context()))
      .rejects.toMatchObject({ code: 'ACCESS_TOKEN_MISMATCH' })
  })

  function createSession() {
    return service.create({
      context: context(),
      accessToken: 'access-old',
      refreshToken: 'refresh-old',
      expiresAt: new Date(Date.now() + 60_000),
    })
  }
})
