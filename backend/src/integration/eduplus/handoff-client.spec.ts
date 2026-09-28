import { createHmac } from 'node:crypto'
import { BadGatewayException, Logger } from '@nestjs/common'
import { HandoffClient } from './handoff-client'
import { redactSecrets } from '../../security/security.module'

describe('HandoffClient', () => {
  afterEach(() => jest.restoreAllMocks())

  it('signs the exact documented canonical input', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: 'id',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 900,
          refresh_expires_in: 1800,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = new HandoffClient()
    const timestamp = 1_778_397_000
    const nonce = 'fixed-nonce'

    await client.exchange({
      baseUrl: 'https://eduplus.example.com',
      clientId: 'oc_xxx',
      clientSecret: 'secret',
      code: 'handoff-code',
      timestamp,
      nonce,
    })

    const expectedSignature = createHmac('sha256', 'secret')
      .update(`oc_xxx\nhandoff-code\n${timestamp}\n${nonce}`)
      .digest('base64url')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://eduplus.example.com/api/v1/app-handoff/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          code: 'handoff-code',
          client_id: 'oc_xxx',
          timestamp,
          nonce,
          signature: expectedSignature,
        }),
      }),
    )
  })

  it.each([
    {
      name: 'missing refresh token',
      payload: { access_token: 'access-canary', expires_in: 300, token_type: 'Bearer' },
      invalidFields: ['refresh_token'],
      fieldTypes: { access_token: 'string', refresh_token: 'undefined', expires_in: 'number' },
      shape: 'object',
      wrapped: false,
    },
    {
      name: 'incorrectly typed expiry',
      payload: { access_token: 'access-canary', refresh_token: 'refresh-canary', expires_in: '300' },
      invalidFields: ['expires_in'],
      fieldTypes: { access_token: 'string', refresh_token: 'string', expires_in: 'string' },
      shape: 'object',
      wrapped: false,
    },
    {
      name: 'data-wrapped token response',
      payload: {
        code: 0,
        data: { access_token: 'access-canary', refresh_token: 'refresh-canary', expires_in: 300 },
        'arbitrary-key-canary': 'arbitrary-value-canary',
      },
      invalidFields: ['access_token', 'refresh_token', 'expires_in'],
      fieldTypes: { access_token: 'undefined', refresh_token: 'undefined', expires_in: 'undefined' },
      shape: 'object',
      wrapped: true,
    },
    {
      name: 'null response',
      payload: null,
      invalidFields: ['access_token', 'refresh_token', 'expires_in'],
      fieldTypes: { access_token: 'undefined', refresh_token: 'undefined', expires_in: 'undefined' },
      shape: 'null',
      wrapped: false,
    },
    {
      name: 'array response',
      payload: ['arbitrary-value-canary'],
      invalidFields: ['access_token', 'refresh_token', 'expires_in'],
      fieldTypes: { access_token: 'undefined', refresh_token: 'undefined', expires_in: 'undefined' },
      shape: 'array',
      wrapped: false,
    },
  ])('diagnoses $name without exposing upstream values', async (scenario) => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify(scenario.payload),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    const error = await new HandoffClient().exchange({
      baseUrl: 'https://eduplus.example.com', clientId: 'oc_xxx',
      clientSecret: 'client-secret-canary', code: 'handoff-code-canary',
    }).catch((value: unknown) => value)

    expect(error).toBeInstanceOf(BadGatewayException)
    const body = (error as BadGatewayException).getResponse()
    const diagnostic = {
      code: 'EDUPLUS_TOKEN_RESPONSE_INCOMPLETE',
      upstream_status: 200,
      invalid_fields: scenario.invalidFields,
      field_types: {
        access_token_type: scenario.fieldTypes.access_token,
        refresh_token_type: scenario.fieldTypes.refresh_token,
        expires_in_type: scenario.fieldTypes.expires_in,
      },
      response_shape: scenario.shape,
      has_wrapped_token_fields: scenario.wrapped,
    }
    expect(body).toMatchObject({
      message: 'EduPlus returned an incomplete token response',
      error: 'Bad Gateway', statusCode: 502,
      ...diagnostic,
    })
    expect(redactSecrets(body)).toMatchObject(diagnostic)
    expect(warning).toHaveBeenCalledWith({
      event: 'eduplus.handoff.token_response_incomplete', ...diagnostic,
    })
    expect(redactSecrets(warning.mock.calls[0][0])).toMatchObject(diagnostic)
    const emitted = JSON.stringify({ body, warnings: warning.mock.calls })
    for (const secret of [
      'access-canary', 'refresh-canary', 'client-secret-canary',
      'handoff-code-canary', 'arbitrary-key-canary', 'arbitrary-value-canary',
    ]) {
      expect(emitted).not.toContain(secret)
    }
  })

  it('uses the tenant token endpoint for a server-side refresh grant', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'access-two', refresh_token: 'refresh-two',
        token_type: 'Bearer', expires_in: 300,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    await new HandoffClient().refresh({
      tokenEndpoint: 'https://issuer.example/token',
      clientId: 'oc_xxx', clientSecret: 'secret', refreshToken: 'refresh-one',
    })

    const init = fetchMock.mock.calls[0][1]!
    expect(fetchMock.mock.calls[0][0]).toBe('https://issuer.example/token')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    })
    expect(String(init.body)).toBe(new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: 'refresh-one',
      client_id: 'oc_xxx', client_secret: 'secret',
    }).toString())
  })

  it('maps OAuth invalid_grant to an authentication failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'secret detail' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ))

    await expect(new HandoffClient().refresh({
      tokenEndpoint: 'https://issuer.example/token', clientId: 'oc_xxx',
      clientSecret: 'secret', refreshToken: 'expired-refresh',
    })).rejects.toMatchObject({ status: 401 })
  })
})
