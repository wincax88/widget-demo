import { Alert, Button, Card, Descriptions, Space, Typography } from 'antd'
import { useState } from 'react'
import { api } from '../services/api'

const COUNT_LABELS: Record<string, string> = {
  teacher: '教职工',
  student: '学生',
  parent: '家长',
  class: '班级',
  course: '课程',
  skipped_teacher_teaching_assignment: '跳过任课关系',
  skipped_student_class_relation: '跳过学生班级关系',
  skipped_parent_student_relation: '跳过亲子关系',
}

export default function SyncPage() {
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [status, setStatus] = useState<'partial' | 'succeeded' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const synchronize = async () => {
    setLoading(true)
    setError(null)
    setCounts(null)
    setStatus(null)
    try {
      const result = await api.startDirectorySync()
      setCounts(result.counts)
      setStatus(result.status)
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
            按当前教职工身份和学校授权范围导入教职工、学生、家长、班级、课程；关系数据只计数，暂不导入。
          </Typography.Paragraph>
        </div>
        {error && <Alert type="error" showIcon message={error} />}
        {status === 'partial' && (
          <Alert
            type="warning"
            showIcon
            message="部分完成"
            description="任课、班级成员和亲子关系尚未导入；依赖这些关系的考试授权与成绩查询暂不可用。"
          />
        )}
        <Button type="primary" loading={loading} onClick={() => void synchronize()}>
          立即同步
        </Button>
        {counts && (
          <Descriptions bordered size="small" column={2}>
            {Object.entries(counts).map(([name, count]) => (
              <Descriptions.Item key={name} label={COUNT_LABELS[name] ?? name}>
                {count}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Space>
    </Card>
  )
}
