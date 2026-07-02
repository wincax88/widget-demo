import { useEffect, useState } from 'react'
import { Card, Form, Input, Button, Descriptions, Typography, Alert, Space } from 'antd'
import { api } from '../services/api'
import type { OAuthTokenResponse } from '../types'

const { Text } = Typography

function decodeJwtPayload(token: string): string {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return 'Invalid JWT format'
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return JSON.stringify(payload, null, 2)
  } catch {
    return 'Failed to decode JWT'
  }
}

export default function OAuthPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OAuthTokenResponse | null>(null)
  const [hasWebhookCreds, setHasWebhookCreds] = useState(false)

  useEffect(() => {
    api.getLatestOAuth().then((creds) => {
      if (creds.client_id) {
        form.setFieldsValue({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          token_endpoint: creds.token_endpoint,
        })
        setHasWebhookCreds(true)
      } else {
        // Build token endpoint from config
        api.getConfig().then((config) => {
          if (config.keycloak_base_url && config.keycloak_realm) {
            form.setFieldValue(
              'token_endpoint',
              `${config.keycloak_base_url}/realms/${config.keycloak_realm}/protocol/openid-connect/token`,
            )
          }
        })
      }
    })
  }, [form])

  const onSubmit = async (values: { client_id: string; client_secret: string; token_endpoint: string }) => {
    setLoading(true)
    setResult(null)
    try {
      const res = await api.testOAuthToken(values)
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {hasWebhookCreds && (
        <Alert
          message="OAuth credentials auto-filled from webhook event"
          description="These credentials were extracted from the most recent subscription.created webhook that contained oauth_client data."
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="OAuth Client Credentials Flow">
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="Token Endpoint" name="token_endpoint" rules={[{ required: true }]}>
            <Input placeholder="http://localhost:8080/realms/eduplus/protocol/openid-connect/token" />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Client ID" name="client_id" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="OAuth client_id from webhook" />
            </Form.Item>

            <Form.Item label="Client Secret" name="client_secret" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input.Password placeholder="OAuth client_secret from webhook" />
            </Form.Item>
          </Space>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Get Token
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {result && (
        <Card title="Token Response" style={{ marginTop: 16 }}>
          {result.error ? (
            <Alert type="error" message="Token exchange failed" description={result.error} showIcon />
          ) : (
            <>
              <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Token Type">{result.token_type}</Descriptions.Item>
                <Descriptions.Item label="Expires In">{result.expires_in}s</Descriptions.Item>
                {result.scope && <Descriptions.Item label="Scope">{result.scope}</Descriptions.Item>}
                <Descriptions.Item label="Access Token">
                  <Text code copyable style={{ wordBreak: 'break-all', fontSize: 11 }}>
                    {result.access_token}
                  </Text>
                </Descriptions.Item>
              </Descriptions>

              {result.access_token && (
                <Card type="inner" title="Decoded JWT Payload" size="small">
                  <pre style={{ margin: 0, fontSize: 12, maxHeight: 400, overflow: 'auto' }}>
                    {decodeJwtPayload(result.access_token)}
                  </pre>
                </Card>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
