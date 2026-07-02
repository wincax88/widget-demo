export interface DemoConfig {
  webhook_secret: string
  api_client_id: string
  api_client_secret: string
  eduplus_base_url: string
  keycloak_base_url: string
  keycloak_realm: string
}

export interface WebhookEvent {
  id: number
  event_id: string
  event_type: string
  tenant_code: string | null
  tenant_name: string | null
  app_code: string | null
  subscription_status: string | null
  signature_valid: boolean
  raw_body: string
  oauth_client_id: string | null
  oauth_client_secret: string | null
  oauth_auth_server_url: string | null
  oauth_token_endpoint: string | null
  received_at: string
}

export interface ApiTestRequest {
  method: string
  path: string
  body?: string
  auth_mode: string
}

export interface ApiTestResponse {
  status_code: number | null
  response_body: string | null
  request_headers: Record<string, string> | null
  string_to_sign: string | null
  body_hash: string | null
  signature: string | null
  error: string | null
}

export interface OAuthTokenResponse {
  access_token: string | null
  token_type: string | null
  expires_in: number | null
  scope: string | null
  raw_response: string | null
  error: string | null
}

export interface OAuthCredentials {
  client_id: string
  client_secret: string
  auth_server_url: string
  token_endpoint: string
}
