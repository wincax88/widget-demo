import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PersonType } from '@prisma/client'
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose'

export interface VerifiedIdentity {
  sub: string
  tenantId: string
  identityId: string
  identityType: PersonType
  clientId: string
  name?: string
  email?: string
  handoffType?: string
}

interface VerifyContext {
  issuer: string
  clientId: string
  jwksUri: string
}

@Injectable()
export class OidcVerifier {
  private readonly keySets = new Map<string, JWTVerifyGetKey>()

  async verify(token: string, context: VerifyContext): Promise<VerifiedIdentity> {
    let keySet = this.keySets.get(context.jwksUri)
    if (!keySet) {
      keySet = createRemoteJWKSet(new URL(context.jwksUri))
      this.keySets.set(context.jwksUri, keySet)
    }

    try {
      const { payload } = await jwtVerify(token, keySet, {
        issuer: context.issuer,
        audience: context.clientId,
      })
      const identityType = String(payload.identity_type ?? '').toUpperCase() as PersonType
      if (!Object.values(PersonType).includes(identityType)) {
        throw new Error('Unsupported identity type')
      }
      const tenantId = String(payload.tenant_id ?? '')
      const identityId = String(payload.identity_id ?? '')
      const clientId = String(payload.azp ?? payload.client_id ?? '')
      if (!payload.sub || !tenantId || !identityId || clientId !== context.clientId) {
        throw new Error('Required identity claims are missing')
      }
      return {
        sub: payload.sub,
        tenantId,
        identityId,
        identityType,
        clientId,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        handoffType:
          typeof payload.handoff_type === 'string' ? payload.handoff_type : undefined,
      }
    } catch {
      throw new UnauthorizedException('OIDC token validation failed')
    }
  }
}
