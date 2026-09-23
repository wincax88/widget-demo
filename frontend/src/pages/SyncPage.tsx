import { Alert, Button, Card, Descriptions, Space, Typography } from 'antd'
import { useState } from 'react'
import { api } from '../services/api'

export default function SyncPage() {
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const synchronize = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.startDirectorySync()
      setCounts(result.counts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步失败')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={2}>同步基座主数据</Typography.Title>
          <Typography.Paragraph type="secondary">
            按当前教职工身份和学校授权范围读取教职工、学生、家长、班级、课程及关系数据。
          </Typography.Paragraph>
        </div>
        {error && <Alert type="error" showIcon message={error} />}
        <Button type="primary" loading={loading} onClick={() => void synchronize()}>
          立即同步
        </Button>
        {counts && (
          <Descriptions bordered size="small" column={2}>
            {Object.entries(counts).map(([name, count]) => (
              <Descriptions.Item key={name} label={name}>
                {count}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Space>
    </Card>
  )
}
