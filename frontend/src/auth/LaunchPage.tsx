import { Alert, Button, Card, Space, Spin, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import { useSession } from './SessionProvider'

export default function LaunchPage() {
  const { tenantCode = '' } = useParams()
  const { session, refresh } = useSession()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const params = new URLSearchParams(window.location.search)
  const code = params.get('eduplus_handoff_code')
  const state = params.get('eduplus_state') ?? undefined

  useEffect(() => {
    if (!tenantCode) return
    sessionStorage.setItem('widget_demo_tenant_code', tenantCode)
    if (!code || started.current) return
    started.current = true
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('eduplus_handoff_code')
    cleanUrl.searchParams.delete('eduplus_state')
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    void api
      .handoff({ tenant_code: tenantCode, code, state })
      .then(refresh)
      .catch((cause) => setError(cause instanceof Error ? cause.message : '登录失败'))
  }, [code, refresh, state, tenantCode])

  if (code && !error && !session?.authenticated) {
    return <Spin fullscreen tip="正在验证 EduPlus 登录信息" />
  }
  if (session?.authenticated) return null
  return (
    <Card style={{ maxWidth: 520, margin: '12vh auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Typography.Title level={2}>考试成绩</Typography.Title>
        <Typography.Paragraph type="secondary">
          使用学校在 EduPlus 订阅本应用时授权的身份登录。
        </Typography.Paragraph>
        {error && <Alert type="error" showIcon message={error} />}
        <Button type="primary" size="large" href={`/api/auth/login/${encodeURIComponent(tenantCode)}`}>
          使用 EduPlus 登录
        </Button>
      </Space>
    </Card>
  )
}
