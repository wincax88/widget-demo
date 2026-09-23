import { Alert, Button, Card, Form, Input, Radio, Space, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { examApi, ExamOptions } from './examApi'

export default function ExamEditorPage() {
  const [options, setOptions] = useState<ExamOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState('weekly')
  const [form] = Form.useForm()
  const navigate = useNavigate()
  useEffect(() => { void examApi.options().then(setOptions).catch((cause) => setError(String(cause))) }, [])
  if (!options && !error) return <Spin />
  const assignments = options?.classrooms.flatMap((classroom) => classroom.courses.map((course) => ({ classroom, course }))) ?? []
  const save = async (values: { title: string; examDate: string; assignment: string; customType?: string }) => {
    const [classroomId, courseId] = values.assignment.split(':')
    await examApi.create({ classroomId, title: values.title, type: type === 'custom' ? values.customType : type, examDate: values.examDate, subjects: [{ courseId, maximumScore: 100 }] })
    navigate('/exams')
  }
  return <Card>
    <Typography.Title level={2}>新建考试</Typography.Title>
    {error && <Alert type="error" message={error} />}
    <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
      <Form.Item label="考试名称" name="title" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item label="考试日期" name="examDate" rules={[{ required: true }]}><Input type="date" /></Form.Item>
      <Form.Item label="任课范围" name="assignment" rules={[{ required: true }]}>
        <Radio.Group><Space direction="vertical">{assignments.map(({ classroom, course }) => <Radio key={`${classroom.id}:${course.id}`} value={`${classroom.id}:${course.id}`}>{classroom.name} / {course.name}</Radio>)}</Space></Radio.Group>
      </Form.Item>
      <Form.Item label="考试类型">
        <Radio.Group value={type} onChange={(event) => setType(event.target.value)} options={[{ label: '周测', value: 'weekly' }, { label: '月考', value: 'monthly' }, { label: '期中', value: 'midterm' }, { label: '期末', value: 'final' }, { label: '自定义', value: 'custom' }]} />
      </Form.Item>
      {type === 'custom' && <Form.Item label="自定义考试类型" name="customType" rules={[{ required: true }]}><Input aria-label="自定义考试类型" /></Form.Item>}
      <Button type="primary" htmlType="submit">保存草稿</Button>
    </Form>
  </Card>
}
