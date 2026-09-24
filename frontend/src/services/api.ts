const BASE = '/api'

export interface SessionIdentity {
  id: string
  type: 'STAFF' | 'TEACHER' | 'STUDENT' | 'PARENT'
  name?: string
}

export type SessionResponse =
  | { authenticated: false }
  | {
      authenticated: true
      tenant: { code: string; name: string }
      identity: SessionIdentity
    }

export interface SyncRun {
  id: string
  status: 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED'
  counts?: Record<string, number>
  startedAt: string
  finishedAt?: string
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const method = (options.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('widget_demo_csrf='))
      ?.slice('widget_demo_csrf='.length)
    if (csrfToken) headers.set('x-csrf-token', decodeURIComponent(csrfToken))
  }
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${response.status}`
    throw new ApiError(response.status, message)
  }
  return body as T
}

export const api = {
  session: () => request<SessionResponse>('/session'),
  handoff: (input: { tenant_code: string; code: string; state?: string }) =>
    request<{ authenticated: true }>('/auth/handoff', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => request<{ authenticated: false }>('/auth/logout', { method: 'POST' }),
  startDirectorySync: () =>
    request<{ run_id: string; status: 'partial' | 'succeeded'; counts: Record<string, number> }>(
      '/directory-sync',
      { method: 'POST' },
    ),
  listDirectorySyncRuns: () => request<SyncRun[]>('/directory-sync/runs'),
}
