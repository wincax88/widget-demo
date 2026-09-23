import { createHmac } from 'node:crypto'
import { HandoffClient } from './handoff-client'

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
