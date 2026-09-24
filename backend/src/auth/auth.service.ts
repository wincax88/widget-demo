import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CredentialKind, TenantStatus } from '@prisma/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { HandoffClient, OidcTokenResponse } from '../integration/eduplus/handoff-client'
import { OidcVerifier } from '../integration/eduplus/oidc-verifier'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly handoffClient: HandoffClient,
    private readonly oidcVerifier: OidcVerifier,
  ) {}

  async acceptHandoff(tenantCode: string, code: string) {
    const context = await this.loadTenantContext(tenantCode)
    const tokens = await this.handoffClient.exchange({
      baseUrl: this.config.getOrThrow<string>('EDUPLUS_BASE_URL'),
      clientId: context.credential.clientId!,
      clientSecret: this.crypto.decrypt(context.credential),
      code,
    })
    return this.acceptOidcTokenResponse(context, tokens, true)
  }

  async buildLogin(tenantCode: string) {
    const context = await this.loadTenantContext(tenantCode)
    const authorizationEndpoint =
      context.tenant.authorizationEndpoint ??
      `${context.tenant.issuerUrl?.replace(/\/$/, '')}/protocol/openid-connect/auth`
    if (!context.tenant.issuerUrl || !authorizationEndpoint) {
      throw new NotFoundException('Tenant OIDC authorization endpoint is not configured')
    }
    const state = randomBytes(24).toString('base64url')
    const redirectUri = this.redirectUri(tenantCode)
    const url = new URL(authorizationEndpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', context.credential.clientId!)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', 'openid profile email')
    url.searchParams.set('state', state)
    return { state, url: url.toString() }
  }

  async acceptAuthorizationCode(tenantCode: string, code: string) {
    const context = await this.loadTenantContext(tenantCode)
    const tokenEndpoint =
      context.tenant.tokenEndpoint ??
      `${context.tenant.issuerUrl?.replace(/\/$/, '')}/protocol/openid-connect/token`
    if (!context.tenant.issuerUrl || !tokenEndpoint) {
      throw new NotFoundException('Tenant OIDC token endpoint is not configured')
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(tenantCode),
      client_id: context.credential.clientId!,
      client_secret: this.crypto.decrypt(context.credential),
    })
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new BadGatewayException('EduPlus authorization-code exchange failed')
    }
    return this.acceptOidcTokenResponse(
      context,
      (await response.json()) as OidcTokenResponse,
      false,
    )
  }

  async findSession(rawToken?: string) {
    if (!rawToken) return null
    const tokenHash = this.hashToken(rawToken)
    const session = await this.prisma.appSession.findUnique({
      where: { tokenHash },
      include: { tenant: true, person: true },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.tenant.status !== TenantStatus.ACTIVE
    ) {
      return null
    }
    return session
  }

  async revoke(rawToken?: string) {
    if (!rawToken) return
    await this.prisma.appSession.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async getAccessTokenForSession(sessionId: string) {
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
      include: {
        tenant: {
          include: {
            credentials: {
              where: { kind: CredentialKind.OAUTH_CLIENT_SECRET, revokedAt: null },
              take: 1,
            },
          },
        },
      },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.tenant.status !== TenantStatus.ACTIVE ||
      !session.refreshCiphertext ||
      !session.refreshIv ||
      !session.refreshAuthenticationTag
    ) {
      throw new UnauthorizedException('Application session cannot be refreshed')
    }
    const credential = session.tenant.credentials[0]
    if (!credential?.clientId || !session.tenant.issuerUrl) {
      throw new UnauthorizedException('Tenant OAuth configuration is unavailable')
    }
    const tokenEndpoint =
      session.tenant.tokenEndpoint ??
      `${session.tenant.issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/token`
    const currentRefreshToken = this.crypto.decrypt({
      ciphertext: session.refreshCiphertext,
      iv: session.refreshIv,
      authenticationTag: session.refreshAuthenticationTag,
    })
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
        client_id: credential.clientId,
        client_secret: this.crypto.decrypt(credential),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new UnauthorizedException('EduPlus application session refresh failed')
    }
    const tokens = (await response.json()) as OidcTokenResponse
    if (!tokens.access_token) {
      throw new UnauthorizedException('EduPlus refresh response is incomplete')
    }
    const identity = await this.oidcVerifier.verify(tokens.access_token, {
      issuer: session.tenant.issuerUrl,
      jwksUri:
        session.tenant.jwksUri ??
        `${session.tenant.issuerUrl.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      clientId: credential.clientId,
    })
    if (
      identity.tenantId !== session.tenant.eduplusTenantId ||
      identity.clientId !== credential.clientId ||
      identity.identityId !== session.identityId
    ) {
      throw new UnauthorizedException('Refreshed token context changed')
    }
    const encrypted = this.crypto.encrypt(tokens.refresh_token ?? currentRefreshToken)
    await this.prisma.appSession.update({
      where: { id: session.id },
      data: {
        refreshCiphertext: encrypted.ciphertext,
        refreshIv: encrypted.iv,
        refreshAuthenticationTag: encrypted.authenticationTag,
        expiresAt: new Date(Date.now() + (tokens.refresh_expires_in ?? 1800) * 1000),
      },
    })
    return tokens.access_token
  }

  private async acceptOidcTokenResponse(
    context: Awaited<ReturnType<AuthService['loadTenantContext']>>,
    tokens: OidcTokenResponse,
    requireHandoff: boolean,
  ) {
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new UnauthorizedException('OIDC token response is incomplete')
    }
    const issuer = context.tenant.issuerUrl
    const jwksUri =
      context.tenant.jwksUri ??
      (issuer ? `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs` : null)
    if (!issuer || !jwksUri) {
      throw new UnauthorizedException('Tenant OIDC verifier is not configured')
    }
    const identity = await this.oidcVerifier.verify(tokens.access_token, {
      issuer,
      jwksUri,
      clientId: context.credential.clientId!,
    })
    const scopes = new Set(tokens.scope?.split(/\s+/).filter(Boolean) ?? [])
    if (
      identity.tenantId !== context.tenant.eduplusTenantId ||
      identity.clientId !== context.credential.clientId ||
      (requireHandoff && (
        !scopes.has('openid') ||
        scopes.has('widget.data.read') ||
        (identity.handoffType !== undefined && identity.handoffType !== 'app_launch')
      ))
    ) {
      throw new UnauthorizedException('OIDC token context does not match the selected tenant')
    }

    const person = await this.prisma.person.upsert({
      where: {
        tenantId_eduplusId: { tenantId: context.tenant.id, eduplusId: identity.sub },
      },
      create: {
        tenantId: context.tenant.id,
        eduplusId: identity.sub,
        type: identity.identityType,
        name: identity.name ?? identity.sub,
        email: identity.email,
      },
      update: {
        type: identity.identityType,
        name: identity.name ?? identity.sub,
        email: identity.email,
        active: true,
      },
    })
    const rawSessionToken = randomBytes(32).toString('base64url')
    const encryptedRefresh = this.crypto.encrypt(tokens.refresh_token)
    const refreshLifetime = tokens.refresh_expires_in ?? 1800
    await this.prisma.appSession.create({
      data: {
        id: randomUUID(),
        tenantId: context.tenant.id,
        personId: person.id,
        identityId: identity.identityId,
        identityType: identity.identityType,
        tokenHash: this.hashToken(rawSessionToken),
        refreshCiphertext: encryptedRefresh.ciphertext,
        refreshIv: encryptedRefresh.iv,
        refreshAuthenticationTag: encryptedRefresh.authenticationTag,
        expiresAt: new Date(Date.now() + refreshLifetime * 1000),
      },
    })
    return { rawSessionToken }
  }

  private async loadTenantContext(tenantCode: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: tenantCode },
      include: {
        credentials: {
          where: { kind: CredentialKind.OAUTH_CLIENT_SECRET, revokedAt: null },
          take: 1,
        },
      },
    })
    if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
      throw new UnauthorizedException('Tenant subscription is not active')
    }
    const credential = tenant.credentials[0]
    if (!credential?.clientId) {
      throw new UnauthorizedException('Tenant OAuth credential is unavailable')
    }
    return { tenant, credential }
  }

  private redirectUri(tenantCode: string) {
    return `${this.config.getOrThrow<string>('APP_ORIGIN')}/api/auth/callback/${encodeURIComponent(tenantCode)}`
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex')
  }
}
