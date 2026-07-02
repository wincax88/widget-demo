# EduPlus Third-Party Integration Demo

A standalone demo app that simulates a third-party application integrating with the EduPlus platform. It tests three core integration flows:

1. **Webhook Reception** - Receives and verifies subscription lifecycle webhooks from EduPlus
2. **API HMAC Signing** - Signs and sends API calls to EduPlus `/v1/open/*` endpoints
3. **OAuth Token Exchange** - Uses OAuth `client_credentials` from webhooks to obtain access tokens
4. **Widget Third-Party APIs** - Provides demo Widget schema discovery, auth, refresh, and batch data APIs

## Quick Start

### Backend (Java 21 + Spring Boot)

```bash
cd demo/backend
./mvnw spring-boot:run
# Runs on http://localhost:8888
```

### Frontend (React 19 + Vite)

```bash
cd demo/frontend
npm install
npm run dev
# Runs on http://localhost:3088
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Webhook Events | `/` | Dashboard of received webhook events with signature status, auto-refreshes every 5s |
| API Tester | `/api-test` | Test HMAC-signed or simple API Key calls to EduPlus, shows full signature debug info |
| OAuth Test | `/oauth` | Exchange OAuth credentials for Keycloak tokens, auto-fills from webhook data |
| Config | `/config` | Manage webhook secret, API credentials, and endpoint URLs |

## Verification

### 1. Test Webhook Reception

Configure the webhook secret in the Config page, then simulate an EduPlus webhook:

```bash
# Generate signature
SECRET="your-webhook-secret"
TIMESTAMP=$(date +%s)
EVENT="subscription.created"
BODY='{"event":"subscription.created","event_id":"test-001","timestamp":'$TIMESTAMP',"tenant":{"id":1,"code":"demo","name":"Demo School"},"app":{"id":1,"code":"demo-app","name":"Demo App","version":"1.0"},"subscription":{"id":1,"status":"active","starts_at":"2026-01-01","expires_at":"2027-01-01"},"plan":{"id":1,"code":"basic","name":"Basic Plan"},"oauth_client":{"client_id":"demo-client","client_secret":"demo-secret","auth_server_url":"http://localhost:8080","token_endpoint":"http://localhost:8080/realms/eduplus/protocol/openid-connect/token"}}'
SIGNATURE=$(echo -n "${TIMESTAMP}.${EVENT}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST http://localhost:8888/api/webhook/eduplus \
  -H "Content-Type: application/json" \
  -H "X-EduPlus-Signature: sha256=${SIGNATURE}" \
  -H "X-EduPlus-Timestamp: ${TIMESTAMP}" \
  -H "X-EduPlus-Event: ${EVENT}" \
  -d "$BODY"
```

### 2. Test API Signing

1. Enter API Client ID and Secret in Config page
2. Go to API Tester, select method and path (e.g., `GET /v1/open/health`)
3. Choose HMAC or Simple auth mode
4. Send request and inspect the signature computation details

### 3. Test OAuth Flow

1. After receiving a `subscription.created` webhook with OAuth credentials, go to OAuth Test page
2. Credentials will be auto-filled from the webhook
3. Click "Get Token" to exchange for a Keycloak access token
4. View the decoded JWT payload

### 4. Test Widget Third-Party APIs

Enable `Widget 接入 API` for this demo app environment in EduPlus with these paths:

```text
Base URL: http://localhost:8888
API Base URL: http://localhost:8888

组件注册 API: /v1/open/demo-school/widgets/schema
Widget 授权 API: /v1/open/demo-school/widgets/auth
Widget Token Refresh API: /v1/open/demo-school/widgets/token/refresh
Widget 批量数据 API: /v1/open/demo-school/widgets/batch-data
```

In the EduPlus developer portal, fill the environment configuration form as follows:

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:8888` |
| API Base URL | `http://localhost:8888` |
| HTTPS 要求 | Off for local demo; production environments require HTTPS |
| OAuth 回调 | `/callback*` |
| 启用三方组件 | On |
| 组件注册 API | `/v1/open/demo-school/widgets/schema` |
| Widget 授权 API | `/v1/open/demo-school/widgets/auth` |
| Widget Token Refresh API | `/v1/open/demo-school/widgets/token/refresh` |
| Widget 批量数据 API | `/v1/open/demo-school/widgets/batch-data` |

Save the environment configuration before opening the component creation dialog. If the component dialog still shows `组件注册 API 不能为空`, close it, reopen the app environment configuration, confirm `启用三方组件` is on and all four Widget API fields are saved, then open `新建组件` again. The component dialog should reuse the saved `组件注册 API` value.

The schema discovery API returns four demo widgets covering every supported Widget type:

| Widget Key | Type | Description |
|------------|------|-------------|
| `demo-school-homework-list` | `list-card` | Recent homework list |
| `demo-school-attendance-stat` | `stat-card` | Attendance statistics |
| `demo-school-exam-table` | `table` | Latest exam scores |
| `demo-school-announcement-timeline` | `timeline` | School announcements |

Fetch the schema list:

```bash
curl http://localhost:8888/v1/open/demo-school/widgets/schema
```

Simulate the Widget auth flow:

```bash
AUTH_RESPONSE=$(curl -s -X POST http://localhost:8888/v1/open/demo-school/widgets/auth \
  -H "Content-Type: application/json" \
  -d '{"handoff_code":"demo-handoff-code","idempotency_key":"demo-001"}')

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token')
REFRESH_SESSION_ID=$(echo "$AUTH_RESPONSE" | jq -r '.refresh_session_id')
```

Fetch mock data for all four widgets:

```bash
curl -X POST http://localhost:8888/v1/open/demo-school/widgets/batch-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{
    "widget_keys": [
      "demo-school-homework-list",
      "demo-school-attendance-stat",
      "demo-school-exam-table",
      "demo-school-announcement-timeline"
    ]
  }'
```

Refresh the demo Widget access token:

```bash
curl -X POST http://localhost:8888/v1/open/demo-school/widgets/token/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"grant_type":"eduplus_widget_token_refresh","refresh_session_id":"'"${REFRESH_SESSION_ID}"'"}'
```

These Widget APIs are demo-only. Tokens are opaque in-memory strings and reset when the demo backend restarts.

## Signature Algorithms

### Webhook Verification (Incoming)

```
payload = "{timestamp}.{event}.{rawBody}"
signature = HmacSHA256Hex(webhookSecret, payload)
Header: X-EduPlus-Signature: sha256={signature}
```

### API Request Signing (Outgoing)

```
string_to_sign = "{METHOD}\n{path}\n{timestamp}\n{nonce}\n{body_hash}"
signature = Base64(HMAC-SHA256(clientSecret, string_to_sign))
Headers: X-Client-Id, X-Timestamp, X-Nonce, X-Signature, X-Body-Hash
```

### Simple Mode (Outgoing)

```
Header: X-API-Key: {client_id}:{client_secret}
```

## Tech Stack

- **Backend**: Java 21, Spring Boot 3.2, H2 (in-memory), JPA
- **Frontend**: React 19, TypeScript, Vite, Ant Design 5
- **Ports**: Backend 8888, Frontend dev 3088

## Vercel Deployment

The GitHub Actions workflow in `.github/workflows/vercel.yml` deploys the frontend app in `frontend/` with the Vercel CLI. Pushes to `main` create Production deployments; pull requests and other branches create Preview deployments.

Configure these GitHub repository secrets before running the workflow:

- `VERCEL_TOKEN`: Vercel access token.
- `VERCEL_ORG_ID`: Vercel team or user ID.
- `VERCEL_PROJECT_ID`: Vercel project ID for the frontend.

To get the IDs locally, install the Vercel CLI, run `vercel login`, then run `vercel link` from `frontend/`. Copy `orgId` and `projectId` from `frontend/.vercel/project.json` into GitHub Actions secrets. Do not commit the `.vercel/` directory.

## Backend Container Image

The GitHub Actions workflow in `.github/workflows/backend-image.yml` builds the Spring Boot backend Docker image from `backend/Dockerfile` and pushes it to GitHub Container Registry on changes to `backend/` or manual runs.

Published tags:

- `ghcr.io/wincax88/widget-demo-backend:latest`
- `ghcr.io/wincax88/widget-demo-backend:<commit-sha>`
- `ghcr.io/wincax88/widget-demo:backend-latest`
- `ghcr.io/wincax88/widget-demo:backend-<commit-sha>`

Use `ghcr.io/wincax88/widget-demo:backend-latest` in Sealos App Launchpad with container port `8888` and public access enabled. If the GHCR package is private, configure image pull credentials in Sealos or make the package public.
