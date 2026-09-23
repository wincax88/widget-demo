import { BadGatewayException, Injectable } from '@nestjs/common'
import { createHmac, randomUUID } from 'node:crypto'

export interface OidcTokenResponse {
  access_token: string
  id_token?: string
  refresh_token: string
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

@Injectable()
export class HandoffClient {
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
    const tokens = (await response.json()) as Partial<OidcTokenResponse>
    if (
      typeof tokens.access_token !== 'string' ||
      typeof tokens.refresh_token !== 'string' ||
      typeof tokens.expires_in !== 'number'
    ) {
      throw new BadGatewayException('EduPlus returned an incomplete token response')
    }
    return tokens as OidcTokenResponse
  }
}
