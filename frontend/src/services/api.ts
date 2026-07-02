import type {
  DemoConfig,
  WebhookEvent,
  ApiTestRequest,
  ApiTestResponse,
  OAuthTokenResponse,
  OAuthCredentials,
} from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  return res.json()
}

export const api = {
  getConfig: () => request<DemoConfig>('/config'),

  updateConfig: (config: DemoConfig) =>
    request<{ success: boolean }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getEvents: () => request<WebhookEvent[]>('/events'),

  clearEvents: () =>
    request<{ success: boolean }>('/events', { method: 'DELETE' }),

  getLatestOAuth: () => request<OAuthCredentials>('/events/latest-oauth'),

  testApiCall: (req: ApiTestRequest) =>
    request<ApiTestResponse>('/test/api-call', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  testOAuthToken: (req: {
    client_id: string
    client_secret: string
    token_endpoint: string
  }) =>
    request<OAuthTokenResponse>('/test/oauth-token', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
}
