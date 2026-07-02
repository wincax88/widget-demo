import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Tag, Button, Space, Modal, Typography, message } from 'antd'
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import type { WebhookEvent } from '../types'

const { Text } = Typography

export default function EventsPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [detailEvent, setDetailEvent] = useState<WebhookEvent | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getEvents()
      setEvents(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    const timer = setInterval(fetchEvents, 5000)
    return () => clearInterval(timer)
  }, [fetchEvents])

  const handleClear = async () => {
    await api.clearEvents()
    setEvents([])
    message.success('Events cleared')
  }

  const columns = [
    {
      title: 'Event Type',
      dataIndex: 'event_type',
      key: 'event_type',
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: 'Event ID',
      dataIndex: 'event_id',
      key: 'event_id',
      ellipsis: true,
      width: 200,
    },
    {
      title: 'Tenant',
      key: 'tenant',
      render: (_: unknown, r: WebhookEvent) =>
        r.tenant_code ? `${r.tenant_name} (${r.tenant_code})` : '-',
    },
    {
      title: 'App',
      dataIndex: 'app_code',
      key: 'app_code',
      render: (v: string | null) => v || '-',
    },
    {
      title: 'Subscription',
      dataIndex: 'subscription_status',
      key: 'subscription_status',
      render: (s: string | null) =>
        s ? (
          <Tag color={s === 'active' ? 'green' : s === 'suspended' ? 'orange' : 'red'}>
            {s}
          </Tag>
        ) : '-',
    },
    {
      title: 'Signature',
      dataIndex: 'signature_valid',
      key: 'signature_valid',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'red'}>{v ? 'Valid' : 'Invalid'}</Tag>
      ),
    },
    {
      title: 'OAuth',
      key: 'oauth',
      render: (_: unknown, r: WebhookEvent) =>
        r.oauth_client_id ? <Tag color="purple">Has OAuth</Tag> : '-',
    },
    {
      title: 'Time',
      dataIndex: 'received_at',
      key: 'received_at',
      width: 180,
      render: (v: string) => v?.replace('T', ' '),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, r: WebhookEvent) => (
        <Button size="small" onClick={() => setDetailEvent(r)}>
          Detail
        </Button>
      ),
    },
  ]

  return (
    <>
      <Card
        title="Webhook Events"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchEvents} loading={loading}>
              Refresh
            </Button>
            <Button icon={<DeleteOutlined />} danger onClick={handleClear}>
              Clear
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Auto-refreshes every 5 seconds. Events from EduPlus webhook push will appear here.
        </Text>
        <Table
          dataSource={events}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="Event Detail"
        open={!!detailEvent}
        onCancel={() => setDetailEvent(null)}
        footer={null}
        width={700}
      >
        {detailEvent && (
          <pre style={{ maxHeight: 500, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(JSON.parse(detailEvent.raw_body || '{}'), null, 2)}
          </pre>
        )}
      </Modal>
    </>
  )
}
