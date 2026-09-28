import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { createHmac, randomUUID } from 'node:crypto'

export interface OidcTokenResponse {
  access_token: string
  id_token?: string
  refresh_token?: string
  token_type: string
  expires_in: number
  refresh_expires_in?: number
  scope?: string
}

interface HandoffExchangeInput {
  baseUrl: string
  clientId: string
  clientSecret: string
  code: string
  timestamp?: number
  nonce?: string
}

interface RefreshInput {
  tokenEndpoint: string
  clientId: string
  clientSecret: string
  refreshToken: string
}

@Injectable()
export class HandoffClient {
  private readonly logger = new Logger(HandoffClient.name)

  async exchange(input: HandoffExchangeInput): Promise<OidcTokenResponse> {
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
    const nonce = input.nonce ?? randomUUID()
    const canonical = `${input.clientId}\n${input.code}\n${timestamp}\n${nonce}`
    const signature = createHmac('sha256', input.clientSecret)
      .update(canonical, 'utf8')
      .digest('base64url')
    const body = {
      code: input.code,
      client_id: input.clientId,
      timestamp,
      nonce,
      signature,
    }

    const response = await fetch(
      `${input.baseUrl.replace(/\/$/, '')}/api/v1/app-handoff/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) {
      throw new BadGatewayException('EduPlus handoff token exchange failed')
    }
    const payload: unknown = await response.json()
    const tokens = (
      payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? payload : {}
    ) as Partial<OidcTokenResponse> & { data?: unknown }
    const fieldTypes = {
      access_token: typeof tokens.access_token,
      refresh_token: typeof tokens.refresh_token,
      expires_in: typeof tokens.expires_in,
    }
    const invalidFields = Object.entries(fieldTypes)
      .filter(([key, type]) => type !== (key === 'expires_in' ? 'number' : 'string'))
      .map(([key]) => key)
    if (invalidFields.length) {
      const nested = tokens.data
      const diagnostic = {
        code: 'EDUPLUS_TOKEN_RESPONSE_INCOMPLETE',
        upstream_status: response.status,
        invalid_fields: invalidFields,
        field_types: {
          access_token_type: fieldTypes.access_token,
          refresh_token_type: fieldTypes.refresh_token,
          expires_in_type: fieldTypes.expires_in,
        },
        response_shape: payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload,
        has_wrapped_token_fields: nested !== null && typeof nested === 'object'
          && !Array.isArray(nested)
          && ['access_token', 'refresh_token', 'expires_in'].some((key) => key in nested),
      }
      // Only fixed field names and types are safe to expose; never log the token payload.
      this.logger.warn({ event: 'eduplus.handoff.token_response_incomplete', ...diagnostic })
      throw new BadGatewayException({
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'EduPlus returned an incomplete token response',
        ...diagnostic,
      })
    }
    return tokens as OidcTokenResponse
  }

  async refresh(input: RefreshInput): Promise<OidcTokenResponse> {
    const response = await fetch(input.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null
      if (response.status === 409) {
        throw new ConflictException('EduPlus widget token refresh conflicted')
      }
      if (response.status === 401 || body?.error === 'invalid_grant') {
        throw new UnauthorizedException('EduPlus widget refresh session is invalid')
      }
      throw new BadGatewayException('EduPlus widget token refresh failed')
    }
    const tokens = (await response.json()) as Partial<OidcTokenResponse>
    if (typeof tokens.access_token !== 'string' || typeof tokens.expires_in !== 'number') {
      throw new BadGatewayException('EduPlus returned an incomplete refresh response')
    }
    return tokens as OidcTokenResponse
  }
}
