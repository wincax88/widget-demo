import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CredentialKind, Prisma, TenantStatus } from '@prisma/client'
import { createHash } from 'node:crypto'
import { decodeJwt } from 'jose'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { HandoffClient } from '../integration/eduplus/handoff-client'
import { OidcVerifier, VerifiedWidgetIdentity } from '../integration/eduplus/oidc-verifier'
import { PrismaService } from '../prisma/prisma.service'
import {
  WidgetRefreshSessionService,
  WidgetSessionContext,
  WidgetSessionError,
} from './widget-refresh-session.service'

export interface WidgetAuthRequest {
  grant_type: string
  client_id: string
  handoff_code: string
  idempotency_key: string
}

export interface WidgetTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
  refresh_session_id: string
  refresh_after: number
}

export interface WidgetRefreshRequest {
  grant_type: string
  refresh_session_id: string
  request_id: string
}

@Injectable()
export class WidgetAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly handoffClient: HandoffClient,
    private readonly verifier: OidcVerifier,
    private readonly sessions: WidgetRefreshSessionService,
  ) {}

  async authorize(input: WidgetAuthRequest): Promise<WidgetTokenResponse> {
    this.validateAuthInput(input)
    const keyHash = hashIdempotencyKey(input.client_id, input.idempotency_key)
    const requestHash = hashAuthRequest(input)
    const replay = await this.loadReplay(keyHash, input.client_id, requestHash)
    if (replay) return replay

    const credential = await this.loadCredential(input.client_id)
    const concurrentReplay = await this.claimExchange(keyHash, input.client_id, requestHash)
    if (concurrentReplay) return concurrentReplay
    let exchangeCompleted = false
    try {
      const tokens = await this.handoffClient.exchange({
        baseUrl: this.config.getOrThrow<string>('EDUPLUS_BASE_URL'),
        clientId: input.client_id,
        clientSecret: this.crypto.decrypt(credential),
        code: input.handoff_code,
      })
      exchangeCompleted = true
      if (!tokens.refresh_token || !positiveInteger(tokens.expires_in)) {
        throw new UnauthorizedException('Widget handoff token response is incomplete')
      }
      const identity = await this.verifyToken(tokens.access_token, credential)
      if (identity.tenantId !== credential.tenant.eduplusTenantId) {
        throw new UnauthorizedException('Widget token context does not match the selected tenant')
      }
      const context = this.sessionContext(credential.tenant.id, identity)
      const refreshLifetime = positiveInteger(tokens.refresh_expires_in)
        ? tokens.refresh_expires_in
        : 1800
      return this.prisma.$transaction(async (transaction) => {
        const session = await this.sessions.create({
          context,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token!,
          expiresAt: new Date(Date.now() + refreshLifetime * 1000),
        }, transaction)
        const response: WidgetTokenResponse = {
          access_token: tokens.access_token,
          token_type: 'Bearer',
          expires_in: tokens.expires_in,
          scope: identity.scope,
          refresh_session_id: session.id,
          refresh_after: Math.max(1, tokens.expires_in - 60),
        }
        await this.storeReplay(
          keyHash,
          input.client_id,
          requestHash,
          response,
          transaction,
        )
        return response
      })
    } catch (error) {
      if (!exchangeCompleted) {
        await this.prisma.widgetAuthExchange.deleteMany({
          where: { keyHash, responseCiphertext: null },
        })
      }
      throw error
    }
  }

  async refresh(
    input: WidgetRefreshRequest,
    authorization?: string,
  ): Promise<WidgetTokenResponse> {
    this.validateRefreshInput(input)
    const currentAccessToken = bearerToken(authorization)
    const row = await this.prisma.widgetRefreshSession.findUnique({
      where: { id: input.refresh_session_id },
      include: {
        tenant: {
          include: {
            credentials: {
              where: { kind: CredentialKind.OAUTH_CLIENT_SECRET, revokedAt: null },
              take: 2,
            },
          },
        },
      },
    })
    const credential = row?.tenant.credentials[0]
    if (
      !row || row.tenant.status !== TenantStatus.ACTIVE
      || row.tenant.credentials.length !== 1 || !credential?.clientId
      || !row.tenant.issuerUrl
    ) {
      throw new UnauthorizedException('Widget refresh session is unavailable')
    }
    const verifierContext = {
      issuer: row.tenant.issuerUrl,
      jwksUri: row.tenant.jwksUri
        ?? `${row.tenant.issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      clientId: credential.clientId,
      appCode: this.config.getOrThrow<string>('EDUPLUS_APP_CODE'),
    }
    const currentIdentity = await this.verifier.verifyWidget(currentAccessToken, {
      ...verifierContext,
      clockToleranceSeconds: 90,
    })
    if (currentIdentity.tenantId !== row.tenant.eduplusTenantId) {
      throw new UnauthorizedException('Widget refresh token tenant changed')
    }
    const currentContext = this.sessionContext(row.tenant.id, currentIdentity)
    const loaded = await this.loadSession(row.id, currentAccessToken, currentContext)
    const tokenEndpoint = row.tenant.tokenEndpoint
      ?? `${row.tenant.issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/token`
    const tokens = await this.handoffClient.refresh({
      tokenEndpoint,
      clientId: credential.clientId,
      clientSecret: this.crypto.decrypt(credential),
      refreshToken: loaded.refreshToken,
    })
    if (!positiveInteger(tokens.expires_in)) {
      throw new UnauthorizedException('Widget refresh response is incomplete')
    }
    const refreshedIdentity = await this.verifier.verifyWidget(tokens.access_token, verifierContext)
    const refreshedContext = this.sessionContext(row.tenant.id, refreshedIdentity)
    if (
      refreshedIdentity.tenantId !== row.tenant.eduplusTenantId
      || JSON.stringify(canonicalContext(refreshedContext))
        !== JSON.stringify(canonicalContext(loaded.context))
    ) {
      throw new UnauthorizedException('Refreshed widget token context changed')
    }
    try {
      await this.sessions.rotate({
        id: row.id,
        currentAccessToken,
        context: loaded.context,
        newAccessToken: tokens.access_token,
        newRefreshToken: tokens.refresh_token ?? loaded.refreshToken,
        ...(positiveInteger(tokens.refresh_expires_in)
          ? { expiresAt: new Date(Date.now() + tokens.refresh_expires_in * 1000) }
          : {}),
      })
    } catch (error) {
      this.rethrowSessionError(error)
    }
    return {
      access_token: tokens.access_token,
      token_type: 'Bearer',
      expires_in: tokens.expires_in,
      scope: refreshedIdentity.scope,
      refresh_session_id: row.id,
      refresh_after: Math.max(1, tokens.expires_in - 60),
    }
  }

  async verifyWidgetAccessToken(token: string) {
    let routing: ReturnType<typeof decodeJwt>
    try {
      routing = decodeJwt(token)
    } catch {
      throw new UnauthorizedException('Widget access token is invalid')
    }
    const clientId = typeof (routing.azp ?? routing.client_id) === 'string'
      ? String(routing.azp ?? routing.client_id)
      : ''
    const appCode = typeof routing.app_code === 'string' ? routing.app_code : ''
    if (
      !clientId
      || appCode !== this.config.getOrThrow<string>('EDUPLUS_APP_CODE')
    ) {
      throw new UnauthorizedException('Widget access token routing claims are invalid')
    }
    const credential = await this.loadCredential(clientId)
    const identity = await this.verifyToken(token, credential)
    if (identity.tenantId !== credential.tenant.eduplusTenantId) {
      throw new UnauthorizedException('Widget access token tenant does not match')
    }
    return { tenant: credential.tenant, identity }
  }

  private validateAuthInput(input: WidgetAuthRequest) {
    if (!input || input.grant_type !== 'eduplus_widget_handoff') {
      throw new BadRequestException('grant_type must be eduplus_widget_handoff')
    }
    for (const [key, value] of Object.entries({
      client_id: input.client_id,
      handoff_code: input.handoff_code,
      idempotency_key: input.idempotency_key,
    })) {
      if (typeof value !== 'string' || !value.trim() || value.length > 512) {
        throw new BadRequestException(`${key} is required`)
      }
    }
    const allowed = new Set(['grant_type', 'client_id', 'handoff_code', 'idempotency_key'])
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new BadRequestException('Widget auth request contains unsupported fields')
    }
  }

  private validateRefreshInput(input: WidgetRefreshRequest) {
    if (!input || input.grant_type !== 'eduplus_widget_token_refresh') {
      throw new BadRequestException('grant_type must be eduplus_widget_token_refresh')
    }
    for (const [key, value] of Object.entries({
      refresh_session_id: input.refresh_session_id,
      request_id: input.request_id,
    })) {
      if (typeof value !== 'string' || !value.trim() || value.length > 512) {
        throw new BadRequestException(`${key} is required`)
      }
    }
    const allowed = new Set(['grant_type', 'refresh_session_id', 'request_id'])
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new BadRequestException('Widget refresh request contains unsupported fields')
    }
  }

  private async loadCredential(clientId: string) {
    const matches = await this.prisma.tenantCredential.findMany({
      where: {
        clientId,
        kind: CredentialKind.OAUTH_CLIENT_SECRET,
        revokedAt: null,
        tenant: { status: TenantStatus.ACTIVE },
      },
      include: { tenant: true },
      take: 2,
    })
    if (matches.length !== 1 || !matches[0].tenant.issuerUrl) {
      throw new UnauthorizedException('Widget OAuth client is unavailable')
    }
    return matches[0]
  }

  private async verifyToken(
    token: string,
    credential: Awaited<ReturnType<WidgetAuthService['loadCredential']>>,
  ) {
    const issuer = credential.tenant.issuerUrl!
    return this.verifier.verifyWidget(token, {
      issuer,
      jwksUri: credential.tenant.jwksUri
        ?? `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      clientId: credential.clientId!,
      appCode: this.config.getOrThrow<string>('EDUPLUS_APP_CODE'),
    })
  }

  private sessionContext(tenantId: string, identity: VerifiedWidgetIdentity): WidgetSessionContext {
    return {
      tenantId,
      userId: identity.sub,
      identityId: identity.identityId,
      identityType: identity.identityType,
      appCode: identity.appCode,
      configSnapshotId: identity.configSnapshotId,
      scope: identity.scope,
      authorization: {
        widgetKeys: identity.widgetKeys,
        dataEndpointKeys: identity.dataEndpointKeys,
        endpointPairs: identity.endpointPairs.map(({ widgetKey, dataEndpointKey, queryPresetKey }) => ({
          widgetKey,
          dataEndpointKey,
          ...(queryPresetKey ? { queryPresetKey } : {}),
        })),
      },
    }
  }

  private async claimExchange(
    keyHash: string,
    clientId: string,
    requestHash: string,
  ): Promise<WidgetTokenResponse | null> {
    try {
      await this.prisma.widgetAuthExchange.create({
        data: {
          keyHash,
          clientId,
          requestHash,
          expiresAt: new Date(Date.now() + 60_000),
        },
      })
      return null
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.loadReplay(keyHash, clientId, requestHash)
        if (replay) return replay
        throw new ConflictException('Widget auth exchange is already in progress')
      }
      throw error
    }
  }

  private async loadReplay(
    keyHash: string,
    clientId: string,
    requestHash: string,
  ): Promise<WidgetTokenResponse | null> {
    const existing = await this.prisma.widgetAuthExchange.findUnique({ where: { keyHash } })
    if (!existing) return null
    if (existing.clientId !== clientId) {
      throw new ConflictException('Idempotency key belongs to another OAuth client')
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency key belongs to another request')
    }
    if (existing.expiresAt <= new Date()) {
      await this.prisma.widgetAuthExchange.deleteMany({ where: { keyHash } })
      return null
    }
    if (!existing.responseCiphertext || !existing.responseIv || !existing.responseTag) {
      throw new ConflictException('Widget auth exchange is already in progress')
    }
    try {
      return JSON.parse(this.crypto.decrypt({
        ciphertext: existing.responseCiphertext,
        iv: existing.responseIv,
        authenticationTag: existing.responseTag,
      }, replayAad(keyHash, clientId, requestHash))) as WidgetTokenResponse
    } catch {
      throw new UnauthorizedException('Widget auth replay is invalid')
    }
  }

  private async storeReplay(
    keyHash: string,
    clientId: string,
    requestHash: string,
    response: WidgetTokenResponse,
    database: Pick<Prisma.TransactionClient, 'widgetAuthExchange'> = this.prisma,
  ) {
    const encrypted = this.crypto.encrypt(
      JSON.stringify(response),
      replayAad(keyHash, clientId, requestHash),
    )
    await database.widgetAuthExchange.update({
      where: { keyHash },
      data: {
        responseCiphertext: encrypted.ciphertext,
        responseIv: encrypted.iv,
        responseTag: encrypted.authenticationTag,
      },
    })
  }

  private async loadSession(id: string, accessToken: string, context: WidgetSessionContext) {
    try {
      return await this.sessions.load(id, accessToken, context)
    } catch (error) {
      this.rethrowSessionError(error)
    }
  }

  private rethrowSessionError(error: unknown): never {
    if (error instanceof WidgetSessionError || (
      error instanceof Error && error.name === 'WidgetSessionError' && 'code' in error
    )) {
      const code = String((error as { code: unknown }).code)
      if (code === 'SESSION_CONFLICT') {
        throw new ConflictException('Widget refresh session changed concurrently')
      }
      throw new UnauthorizedException('Widget refresh session is invalid')
    }
    throw error
  }
}

function hashIdempotencyKey(clientId: string, key: string) {
  return createHash('sha256').update(`${clientId}\0${key}`, 'utf8').digest('base64url')
}

function hashAuthRequest(input: WidgetAuthRequest) {
  return createHash('sha256')
    .update(`${input.grant_type}\0${input.client_id}\0${input.handoff_code}`, 'utf8')
    .digest('base64url')
}

function replayAad(keyHash: string, clientId: string, requestHash: string) {
  return Buffer.from(JSON.stringify({ keyHash, clientId, requestHash }), 'utf8')
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function bearerToken(value?: string) {
  const match = /^Bearer ([^\s]+)$/.exec(value ?? '')
  if (!match) throw new UnauthorizedException('Bearer access token is required')
  return match[1]
}

function canonicalContext(context: WidgetSessionContext): WidgetSessionContext {
  return {
    tenantId: context.tenantId,
    userId: context.userId,
    identityId: context.identityId,
    identityType: context.identityType,
    appCode: context.appCode,
    configSnapshotId: context.configSnapshotId,
    scope: context.scope,
    authorization: {
      widgetKeys: [...context.authorization.widgetKeys].sort(),
      dataEndpointKeys: [...context.authorization.dataEndpointKeys].sort(),
      endpointPairs: [...context.authorization.endpointPairs]
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    },
  }
}
