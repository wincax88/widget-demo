import { Button, Result, Spin } from 'antd'
import { Navigate, Route, Routes } from 'react-router-dom'
import LaunchPage from './auth/LaunchPage'
import { SessionProvider, useSession } from './auth/SessionProvider'
import AppShell from './layout/AppShell'
import SyncPage from './pages/SyncPage'
import ExamListPage from './exams/ExamListPage'
import ExamEditorPage from './exams/ExamEditorPage'
import ScoreGridPage from './exams/ScoreGridPage'
import MyResultsPage from './results/MyResultsPage'
import ChildResultsPage from './results/ChildResultsPage'

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
  const identityType = session.identity.type
  const canManage = identityType === 'TEACHER' || identityType === 'STAFF'
  const landingPath = identityType === 'STUDENT'
    ? '/results/me'
    : identityType === 'PARENT'
      ? '/results/children'
      : '/exams'
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={landingPath} replace />} />
        <Route path="/launch/:tenantCode" element={<Navigate to={landingPath} replace />} />
        <Route path="/results/me" element={identityType === 'STUDENT' ? <MyResultsPage tenantCode={session.tenant.code} /> : <Navigate to={landingPath} replace />} />
        <Route path="/results/children" element={identityType === 'PARENT' ? <ChildResultsPage tenantCode={session.tenant.code} /> : <Navigate to={landingPath} replace />} />
        <Route path="/sync" element={canManage ? <SyncPage /> : <Navigate to={landingPath} replace />} />
        <Route path="/exams" element={canManage ? <ExamListPage /> : <Navigate to={landingPath} replace />} />
        <Route path="/exams/new" element={canManage ? <ExamEditorPage /> : <Navigate to={landingPath} replace />} />
        <Route path="/exams/:id/scores" element={canManage ? <ScoreGridPage /> : <Navigate to={landingPath} replace />} />
        <Route path="*" element={<Navigate to={landingPath} replace />} />
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
