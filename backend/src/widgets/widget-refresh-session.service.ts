import { Injectable } from '@nestjs/common'
import { Prisma, WidgetRefreshSession } from '@prisma/client'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { PrismaService } from '../prisma/prisma.service'

export interface WidgetAuthorizationSnapshot {
  widgetKeys: string[]
  dataEndpointKeys: string[]
  endpointPairs: Array<{ widgetKey: string; dataEndpointKey: string }>
}

export interface WidgetSessionContext {
  tenantId: string
  userId: string
  identityType: string
  appCode: string
  configSnapshotId: string
  authorization: WidgetAuthorizationSnapshot
}

export type WidgetSessionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'ACCESS_TOKEN_MISMATCH'
  | 'SESSION_CONTEXT_MISMATCH'
  | 'SESSION_INTEGRITY_FAILED'
  | 'SESSION_CONFLICT'

export class WidgetSessionError extends Error {
  constructor(readonly code: WidgetSessionErrorCode) {
    super(code)
    this.name = 'WidgetSessionError'
  }
}

@Injectable()
export class WidgetRefreshSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async create(input: {
    context: WidgetSessionContext
    accessToken: string
    refreshToken: string
    expiresAt: Date
  }) {
    const authorization = normalizeAuthorization(input.context.authorization)
    const context = { ...input.context, authorization }
    const id = randomUUID()
    const encrypted = this.crypto.encrypt(input.refreshToken, aadFor(id, context))
    return this.prisma.widgetRefreshSession.create({
      data: {
        id,
        tenantId: context.tenantId,
        userId: context.userId,
        identityType: context.identityType,
        appCode: context.appCode,
        configSnapshotId: context.configSnapshotId,
        accessTokenHash: tokenHash(input.accessToken),
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.authenticationTag,
        authorizationJson: authorization as unknown as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
      },
      select: { id: true, expiresAt: true },
    })
  }

  async load(id: string, accessToken: string, expected: WidgetSessionContext) {
    const session = await this.prisma.widgetRefreshSession.findUnique({ where: { id } })
    this.assertUsable(session)
    if (!hashesEqual(session.accessTokenHash, tokenHash(accessToken))) {
      throw new WidgetSessionError('ACCESS_TOKEN_MISMATCH')
    }
    const context = contextOf(session)
    assertContext(context, expected)
    let refreshToken: string
    try {
      refreshToken = this.crypto.decrypt({
        ciphertext: session.refreshTokenCiphertext,
        iv: session.refreshTokenIv,
        authenticationTag: session.refreshTokenTag,
      }, aadFor(session.id, context))
    } catch {
      throw new WidgetSessionError('SESSION_INTEGRITY_FAILED')
    }
    return {
      id: session.id,
      expiresAt: session.expiresAt,
      context,
      refreshToken,
    }
  }

  async rotate(input: {
    id: string
    currentAccessToken: string
    context: WidgetSessionContext
    newAccessToken: string
    newRefreshToken: string
    expiresAt?: Date
  }) {
    const session = await this.prisma.widgetRefreshSession.findUnique({ where: { id: input.id } })
    this.assertUsable(session)
    const previousHash = tokenHash(input.currentAccessToken)
    if (!hashesEqual(session.accessTokenHash, previousHash)) {
      throw new WidgetSessionError('SESSION_CONFLICT')
    }
    const context = contextOf(session)
    assertContext(context, input.context)
    const encrypted = this.crypto.encrypt(input.newRefreshToken, aadFor(session.id, context))
    const updated = await this.prisma.widgetRefreshSession.updateMany({
      where: {
        id: input.id,
        tenantId: input.context.tenantId,
        accessTokenHash: previousHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        accessTokenHash: tokenHash(input.newAccessToken),
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        refreshTokenTag: encrypted.authenticationTag,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    })
    if (updated.count !== 1) throw new WidgetSessionError('SESSION_CONFLICT')
    return { id: input.id, accessToken: input.newAccessToken }
  }

  async revoke(id: string, expected: WidgetSessionContext) {
    const session = await this.prisma.widgetRefreshSession.findUnique({ where: { id } })
    this.assertUsable(session)
    assertContext(contextOf(session), expected)
    const updated = await this.prisma.widgetRefreshSession.updateMany({
      where: { id, tenantId: expected.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (updated.count !== 1) throw new WidgetSessionError('SESSION_CONFLICT')
  }

  private assertUsable(session: WidgetRefreshSession | null): asserts session is WidgetRefreshSession {
    if (!session) throw new WidgetSessionError('SESSION_NOT_FOUND')
    if (session.revokedAt) throw new WidgetSessionError('SESSION_REVOKED')
    if (session.expiresAt.getTime() <= Date.now()) throw new WidgetSessionError('SESSION_EXPIRED')
  }
}

function tokenHash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('base64url')
}

function hashesEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function contextOf(session: WidgetRefreshSession): WidgetSessionContext {
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    identityType: session.identityType,
    appCode: session.appCode,
    configSnapshotId: session.configSnapshotId,
    authorization: normalizeAuthorization(session.authorizationJson as unknown as WidgetAuthorizationSnapshot),
  }
}

function assertContext(actual: WidgetSessionContext, expected: WidgetSessionContext) {
  const matches = actual.tenantId === expected.tenantId
    && actual.userId === expected.userId
    && actual.identityType === expected.identityType
    && actual.appCode === expected.appCode
    && actual.configSnapshotId === expected.configSnapshotId
    && JSON.stringify(actual.authorization) === JSON.stringify(normalizeAuthorization(expected.authorization))
  if (!matches) throw new WidgetSessionError('SESSION_CONTEXT_MISMATCH')
}

function normalizeAuthorization(value: WidgetAuthorizationSnapshot): WidgetAuthorizationSnapshot {
  return {
    widgetKeys: [...value.widgetKeys].sort(),
    dataEndpointKeys: [...value.dataEndpointKeys].sort(),
    endpointPairs: [...value.endpointPairs]
      .map((pair) => ({ widgetKey: pair.widgetKey, dataEndpointKey: pair.dataEndpointKey }))
      .sort((left, right) => `${left.widgetKey}\0${left.dataEndpointKey}`.localeCompare(`${right.widgetKey}\0${right.dataEndpointKey}`)),
  }
}

function aadFor(id: string, context: WidgetSessionContext) {
  return Buffer.from(JSON.stringify({
    id,
    tenantId: context.tenantId,
    userId: context.userId,
    identityType: context.identityType,
    appCode: context.appCode,
    configSnapshotId: context.configSnapshotId,
    authorization: normalizeAuthorization(context.authorization),
  }), 'utf8')
}
