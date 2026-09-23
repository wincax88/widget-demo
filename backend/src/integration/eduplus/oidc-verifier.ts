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

export interface VerifiedWidgetIdentity extends VerifiedIdentity {
  appCode: string
  configSnapshotId: string
  scope: string
  widgetKeys: string[]
  dataEndpointKeys: string[]
  endpointPairs: Array<{
    widgetKey: string
    dataEndpointKey: string
    queryPresetKey?: string
  }>
}

interface VerifyContext {
  issuer: string
  clientId: string
  jwksUri: string
}

interface VerifyWidgetContext extends VerifyContext {
  appCode: string
  clockToleranceSeconds?: number
}

@Injectable()
export class OidcVerifier {
  private readonly keySets = new Map<string, JWTVerifyGetKey>()

  async verify(token: string, context: VerifyContext): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.keySet(context.jwksUri), {
        issuer: context.issuer,
      })
      const identityType = this.toPersonType(payload.identity_type ?? payload.eit)
      if (!identityType) {
        throw new Error('Unsupported identity type')
      }
      const tenantId = String(payload.tenant_id ?? payload.tid ?? '')
      const identityId = String(payload.identity_id ?? payload.eui ?? payload.sub ?? '')
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

  async verifyWidget(
    token: string,
    context: VerifyWidgetContext,
  ): Promise<VerifiedWidgetIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.keySet(context.jwksUri), {
        issuer: context.issuer,
        audience: `app:${context.appCode}:widget-data`,
        clockTolerance: context.clockToleranceSeconds,
      })
      const identityType = this.toPersonType(payload.identity_type ?? payload.eit)
      const tenantId = requiredText(payload.tenant_id ?? payload.tid)
      const identityId = requiredText(payload.identity_id ?? payload.eui ?? payload.sub)
      const clientId = requiredText(payload.azp ?? payload.client_id)
      const appCode = requiredText(payload.app_code)
      const configSnapshotId = requiredText(payload.config_snapshot_id)
      const scope = requiredText(payload.scope)
      const widgetKeys = stringArray(payload.widget_keys)
      const dataEndpointKeys = stringArray(payload.data_endpoint_keys)
      const endpointPairs = endpointPairArray(payload.widget_endpoint_pairs)
      const allowedWidgets = new Set(widgetKeys)
      const allowedEndpoints = new Set(dataEndpointKeys)
      const expectedAudience = `app:${context.appCode}:widget-data`
      if (
        !payload.sub || !payload.jti || typeof payload.exp !== 'number'
        || !identityType || !tenantId || !identityId
        || clientId !== context.clientId || appCode !== context.appCode
        || !hasExactAudience(payload.aud, expectedAudience)
        || payload.handoff_type !== 'widget_data'
        || scope !== 'widget.data.read'
        || widgetKeys.length === 0 || dataEndpointKeys.length === 0 || endpointPairs.length === 0
        || endpointPairs.some((pair) =>
          !allowedWidgets.has(pair.widgetKey) || !allowedEndpoints.has(pair.dataEndpointKey))
      ) {
        throw new Error('Required widget claims are missing')
      }
      return {
        sub: payload.sub,
        tenantId,
        identityId,
        identityType,
        clientId,
        handoffType: 'widget_data',
        appCode,
        configSnapshotId,
        scope,
        widgetKeys,
        dataEndpointKeys,
        endpointPairs,
      }
    } catch {
      throw new UnauthorizedException('OIDC widget token validation failed')
    }
  }

  private keySet(jwksUri: string) {
    let keySet = this.keySets.get(jwksUri)
    if (!keySet) {
      keySet = createRemoteJWKSet(new URL(jwksUri))
      this.keySets.set(jwksUri, keySet)
    }
    return keySet
  }

  private toPersonType(value: unknown): PersonType | null {
    const normalized = String(value ?? '').toLowerCase()
    const aliases: Record<string, PersonType> = {
      staff: PersonType.STAFF,
      teacher: PersonType.TEACHER,
      tch: PersonType.TEACHER,
      student: PersonType.STUDENT,
      stu: PersonType.STUDENT,
      parent: PersonType.PARENT,
      par: PersonType.PARENT,
    }
    return aliases[normalized] ?? null
  }
}

function hasExactAudience(value: unknown, expected: string) {
  return value === expected
    || (Array.isArray(value) && value.length === 1 && value[0] === expected)
}

function requiredText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || ''
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  const values = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  return values.length === value.length ? [...new Set(values)] : []
}

function endpointPairArray(value: unknown): VerifiedWidgetIdentity['endpointPairs'] {
  if (!Array.isArray(value)) return []
  const pairs: VerifiedWidgetIdentity['endpointPairs'] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const pair = item as Record<string, unknown>
    const widgetKey = requiredText(pair.widget_key)
    const dataEndpointKey = requiredText(pair.data_endpoint_key)
    const queryPresetKey = requiredText(pair.query_preset_key)
    if (!widgetKey || !dataEndpointKey) return []
    pairs.push({ widgetKey, dataEndpointKey, ...(queryPresetKey ? { queryPresetKey } : {}) })
  }
  return pairs
}
