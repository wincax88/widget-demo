import { Alert, Button, Result } from 'antd'
import { ApiError } from '../services/api'

interface ResultsErrorProps {
  cause: unknown
  tenantCode?: string
  onRetry: () => void
}

export default function ResultsError({ cause, tenantCode, onRetry }: ResultsErrorProps) {
  const message = cause instanceof Error ? cause.message : '无法读取成绩'
  if (cause instanceof ApiError && cause.status === 401) {
    return (
      <Result
        status="warning"
        title="登录已过期"
        subTitle="请重新登录；也可以返回 EduPlus 工作台再次打开应用。"
        extra={<Button type="primary" href={loginUrl(tenantCode)}>重新登录</Button>}
      />
    )
  }
  if (cause instanceof ApiError && cause.status === 403) {
    return (
      <Result
        status="403"
        title="暂无权限或订阅不可用"
        subTitle={message}
        extra={<Button onClick={onRetry}>重新检查</Button>}
      />
    )
  }
  return (
    <Alert
      type="error"
      showIcon
      message="成绩加载失败"
      description={message}
      action={<Button onClick={onRetry}>重新加载</Button>}
    />
  )
}

function loginUrl(tenantCode?: string) {
  return tenantCode ? `/api/auth/login/${encodeURIComponent(tenantCode)}` : '/'
}
