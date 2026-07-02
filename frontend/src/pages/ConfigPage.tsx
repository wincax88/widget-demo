import { useEffect, useState } from 'react'
import { Card, Form, Input, Button, message, Typography, Alert } from 'antd'
import { api } from '../services/api'
import type { DemoConfig } from '../types'

const { Text } = Typography

export default function ConfigPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getConfig().then((config) => form.setFieldsValue(config))
  }, [form])

  const onSave = async (values: DemoConfig) => {
    setLoading(true)
    try {
      await api.updateConfig(values)
      message.success('Configuration saved')
    } catch {
      message.error('Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <Alert
        message="Webhook URL"
        description={
          <Text code copyable>
            http://localhost:8888/api/webhook/eduplus
          </Text>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Demo Configuration">
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Form.Item label="Webhook Secret" name="webhook_secret">
            <Input.Password placeholder="From EduPlus app webhook settings" />
          </Form.Item>

          <Form.Item label="API Client ID" name="api_client_id">
            <Input placeholder="API credential client_id" />
          </Form.Item>

          <Form.Item label="API Client Secret" name="api_client_secret">
            <Input.Password placeholder="API credential client_secret" />
          </Form.Item>

          <Form.Item label="EduPlus Base URL" name="eduplus_base_url">
            <Input placeholder="http://localhost:9080/api" />
          </Form.Item>

          <Form.Item label="Keycloak Base URL" name="keycloak_base_url">
            <Input placeholder="http://localhost:8080" />
          </Form.Item>

          <Form.Item label="Keycloak Realm" name="keycloak_realm">
            <Input placeholder="eduplus" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Save Configuration
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
