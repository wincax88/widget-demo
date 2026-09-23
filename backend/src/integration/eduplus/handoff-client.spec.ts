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
})
