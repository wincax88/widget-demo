import { Button, Card, Result, Spin, Typography } from 'antd'
import { Navigate, Route, Routes } from 'react-router-dom'
import LaunchPage from './auth/LaunchPage'
import { SessionProvider, useSession } from './auth/SessionProvider'
import AppShell from './layout/AppShell'
import SyncPage from './pages/SyncPage'

function ApplicationRoutes() {
  const { session, loading, error } = useSession()
  if (loading) return <Spin fullscreen tip="正在加载应用会话" />
  if (!session?.authenticated) {
    return (
      <Routes>
        <Route path="/launch/:tenantCode" element={<LaunchPage />} />
        <Route
          path="*"
          element={
            <Result
              status={error ? 'warning' : 'info'}
              title="考试成绩"
              subTitle={error ?? '请从 EduPlus 工作台进入，或使用学校对应的 EduPlus 登录入口。'}
              extra={
                <Button type="primary" href="/launch">
                  使用 EduPlus 登录
                </Button>
              }
            />
          }
        />
      </Routes>
    )
  }
  const canSync = session.identity.type === 'TEACHER' || session.identity.type === 'STAFF'
  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={
            <Card>
              <Typography.Title level={2}>考试成绩</Typography.Title>
              <Typography.Paragraph type="secondary">
                当前身份：{session.identity.name ?? session.identity.id}
              </Typography.Paragraph>
            </Card>
          }
        />
        <Route path="/launch/:tenantCode" element={<Navigate to="/" replace />} />
        <Route path="/sync" element={canSync ? <SyncPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <ApplicationRoutes />
    </SessionProvider>
  )
}
