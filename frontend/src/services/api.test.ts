import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './api'

describe('API request security', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'widget_demo_csrf=; Max-Age=0; Path=/'
  })

  it('copies the CSRF cookie into the header for state-changing requests', async () => {
    document.cookie = 'widget_demo_csrf=csrf-token; Path=/'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await request('/directory-sync', { method: 'POST', body: '{}' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/directory-sync',
      expect.objectContaining({ credentials: 'include' }),
    )
    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(options.headers).get('x-csrf-token')).toBe('csrf-token')
  })

  it('preserves safe diagnostic fields on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: 'AI Center 调用额度已用尽', code: 'quota_exceeded', request_id: 'request-1',
      upstream_status: 429, retryable: false, api_key: 'secret-canary',
    }), { status: 429, headers: { 'content-type': 'application/json' } })))
    const error = await request('/ai-center/chat', { method: 'POST', body: '{}' }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, details: {
      code: 'quota_exceeded', request_id: 'request-1', upstream_status: 429, retryable: false,
    } })
    expect(JSON.stringify(error)).not.toContain('secret-canary')
  })
})
