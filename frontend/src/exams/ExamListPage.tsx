import { Button, Card, Modal, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { examApi, Exam } from './examApi'

const labels = { DRAFT: ['草稿', 'default'], PUBLISHED: ['已发布', 'green'], WITHDRAWN: ['已撤回', 'orange'] } as const
export default function ExamListPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const load = () => examApi.list().then(setExams)
  useEffect(() => { void load() }, [])
  const confirm = (exam: Exam, action: 'publish' | 'withdraw') => Modal.confirm({
    title: action === 'publish' ? '确认发布考试？' : '确认撤回考试？',
    content: action === 'publish' ? '发布后学生和家长将立即看到成绩。' : '撤回后学生和家长将立即无法查看。',
    okText: '确认', cancelText: '取消',
    onOk: async () => { await examApi[action](exam.id); await load() },
  })
  return <Card><Space style={{ width: '100%', justifyContent: 'space-between' }}><Typography.Title level={2}>考试管理</Typography.Title><Button type="primary"><Link to="/exams/new">新建考试</Link></Button></Space><Table rowKey="id" dataSource={exams} columns={[{ title: '考试', dataIndex: 'title' }, { title: '状态', dataIndex: 'status', render: (status) => <Tag color={labels[status as keyof typeof labels][1]}>{labels[status as keyof typeof labels][0]}</Tag> }, { title: '操作', render: (_, exam: Exam) => <Space><Link to={`/exams/${exam.id}/scores`}>录入成绩</Link>{exam.status === 'DRAFT' && <Button size="small" onClick={() => confirm(exam, 'publish')}>发布</Button>}{exam.status === 'PUBLISHED' && <Button size="small" danger onClick={() => confirm(exam, 'withdraw')}>撤回</Button>}</Space> }]} /></Card>
}
