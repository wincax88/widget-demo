import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  SettingOutlined,
  BellOutlined,
  ApiOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import EventsPage from './pages/EventsPage'
import ConfigPage from './pages/ConfigPage'
import ApiTesterPage from './pages/ApiTesterPage'
import OAuthPage from './pages/OAuthPage'

const { Header, Content, Sider } = Layout

const menuItems = [
  { key: '/', icon: <BellOutlined />, label: <Link to="/">Webhook Events</Link> },
  { key: '/api-test', icon: <ApiOutlined />, label: <Link to="/api-test">API Tester</Link> },
  { key: '/oauth', icon: <SafetyOutlined />, label: <Link to="/oauth">OAuth Test</Link> },
  { key: '/config', icon: <SettingOutlined />, label: <Link to="/config">Config</Link> },
]

export default function App() {
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 32, margin: 16, color: '#fff', fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
          EduPlus Demo
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: '#fff', fontSize: 18, fontWeight: 500 }}>
          EduPlus Third-Party Integration Demo
        </Header>
        <Content style={{ margin: 24 }}>
          <Routes>
            <Route path="/" element={<EventsPage />} />
            <Route path="/api-test" element={<ApiTesterPage />} />
            <Route path="/oauth" element={<OAuthPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
