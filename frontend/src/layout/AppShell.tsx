import { DatabaseOutlined, HomeOutlined, LogoutOutlined } from '@ant-design/icons'
import { Button, Layout, Menu, Space, Typography } from 'antd'
import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'

const { Header, Content, Sider } = Layout

export default function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useSession()
  const location = useLocation()
  if (!session?.authenticated) return null
  const canSync = session.identity.type === 'TEACHER' || session.identity.type === 'STAFF'
  const items = [
    { key: '/', icon: <HomeOutlined />, label: <Link to="/">考试成绩</Link> },
    ...(canSync
      ? [{ key: '/sync', icon: <DatabaseOutlined />, label: <Link to="/sync">主数据同步</Link> }]
      : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f3f6fb' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="light">
        <Typography.Title level={4} style={{ padding: '22px 24px 12px', margin: 0 }}>
          考试成绩
        </Typography.Title>
        <Menu mode="inline" selectedKeys={[location.pathname]} items={items} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text strong>{session.tenant.name}</Typography.Text>
            <Space>
              <Typography.Text type="secondary">
                {session.identity.name ?? session.identity.id}
              </Typography.Text>
              <Button icon={<LogoutOutlined />} type="text" onClick={() => void logout()}>
                退出
              </Button>
            </Space>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  )
}
