import { useState } from 'react'
import { Card, Form, Input, Select, Button, Descriptions, Typography, Space, Radio } from 'antd'
import { api } from '../services/api'
import type { ApiTestResponse } from '../types'

const { Text } = Typography
const { TextArea } = Input

export default function ApiTesterPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiTestResponse | null>(null)

  const onSubmit = async (values: { method: string; path: string; body: string; auth_mode: string }) => {
    setLoading(true)
    setResult(null)
    try {
      const res = await api.testApiCall({
        method: values.method,
        path: values.path,
        body: values.body || undefined,
        auth_mode: values.auth_mode,
      })
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Card title="API Call Tester">
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ method: 'GET', path: '/v1/open/health', auth_mode: 'hmac' }}
        >
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Form.Item name="method" noStyle>
              <Select style={{ width: 120 }}>
                <Select.Option value="GET">GET</Select.Option>
                <Select.Option value="POST">POST</Select.Option>
                <Select.Option value="PUT">PUT</Select.Option>
                <Select.Option value="DELETE">DELETE</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="path" noStyle>
              <Input placeholder="/v1/open/..." style={{ flex: 1 }} />
            </Form.Item>
          </Space.Compact>

          <Form.Item label="Auth Mode" name="auth_mode">
            <Radio.Group>
              <Radio value="hmac">HMAC Signature</Radio>
              <Radio value="simple">Simple (API Key)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Request Body (JSON)" name="body">
            <TextArea rows={4} placeholder='{"key": "value"}' />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Send Request
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {result && (
        <Card title="Result" style={{ marginTop: 16 }}>
          {result.error && (
            <Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
              {result.error}
            </Text>
          )}

          {result.request_headers && (
            <Descriptions title="Request Headers" column={1} size="small" bordered style={{ marginBottom: 16 }}>
              {Object.entries(result.request_headers).map(([k, v]) => (
                <Descriptions.Item key={k} label={k}>
                  <Text code copyable>{v}</Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          )}

          {result.string_to_sign && (
            <Descriptions title="Signature Debug" column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="String to Sign">
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{result.string_to_sign}</pre>
              </Descriptions.Item>
              {result.body_hash && (
                <Descriptions.Item label="Body Hash">
                  <Text code>{result.body_hash}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Signature">
                <Text code>{result.signature}</Text>
              </Descriptions.Item>
            </Descriptions>
          )}

          {result.status_code != null && (
            <Descriptions title="Response" column={1} size="small" bordered>
              <Descriptions.Item label="Status Code">
                <Text type={result.status_code < 400 ? 'success' : 'danger'}>
                  {result.status_code}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Body">
                <pre style={{ margin: 0, fontSize: 12, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(result.response_body || ''), null, 2)
                    } catch {
                      return result.response_body
                    }
                  })()}
                </pre>
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      )}
    </div>
  )
}
