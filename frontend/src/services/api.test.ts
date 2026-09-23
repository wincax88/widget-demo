import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './api'

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
})
