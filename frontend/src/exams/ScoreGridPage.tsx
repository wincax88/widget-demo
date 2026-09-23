import { Alert, Button, Card, InputNumber, Space, Spin, Table, Typography } from 'antd'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useParams } from 'react-router-dom'
import CsvImportPanel from './CsvImportPanel'
import { examApi, Exam, ExamOptions } from './examApi'

type Grid = Record<string, Record<string, number | null>>
function reducer(state: Grid, action: { studentId: string; subjectId: string; value: number | null }): Grid {
  return { ...state, [action.studentId]: { ...state[action.studentId], [action.subjectId]: action.value } }
}

export default function ScoreGridPage({ examId: suppliedId }: { examId?: string }) {
  const route = useParams()
  const examId = suppliedId ?? route.id ?? ''
  const [exam, setExam] = useState<Exam | null>(null)
  const [options, setOptions] = useState<ExamOptions | null>(null)
  const [grid, dispatch] = useReducer(reducer, {})
  const [saved, setSaved] = useState(false)
  useEffect(() => { void Promise.all([examApi.detail(examId), examApi.options()]).then(([detail, choices]) => { setExam(detail); setOptions(choices) }) }, [examId])
  const classroom = options?.classrooms.find((item) => item.id === exam?.classroomId)
  const errors = useMemo(() => exam?.subjects.flatMap((subject) => (classroom?.students ?? []).flatMap((student) => {
    const value = grid[student.eduplusId]?.[subject.id]
    return value != null && value > subject.maximumScore ? [`${student.eduplusId}:${subject.id}`] : []
  })) ?? [], [classroom, exam, grid])
  if (!exam || !options) return <Spin />
  const save = async () => {
    if (errors.length) return
    const cells = classroom?.students.flatMap((student) => exam.subjects.map((subject) => ({ studentEduplusId: student.eduplusId, subjectId: subject.id, score: grid[student.eduplusId]?.[subject.id] ?? null, absent: false }))) ?? []
    await examApi.saveScores(exam.id, cells); setSaved(true)
  }
  const columns = [{ title: '学生', dataIndex: 'name' }, ...exam.subjects.map((subject) => ({ title: `${subject.course.name} / ${subject.maximumScore}`, render: (_: unknown, student: { eduplusId: string; name: string }) => {
    const invalid = errors.includes(`${student.eduplusId}:${subject.id}`)
    return <Space direction="vertical"><InputNumber aria-label={`${student.name} ${subject.course.name}`} value={grid[student.eduplusId]?.[subject.id]} min={0} onChange={(value) => dispatch({ studentId: student.eduplusId, subjectId: subject.id, value })} />{invalid && <Typography.Text type="danger">分数不能超过 {subject.maximumScore}</Typography.Text>}</Space>
  } }))]
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><Card><Typography.Title level={2}>{exam.title} · 成绩录入</Typography.Title>{saved && <Alert type="success" message="草稿成绩已保存" />}<Table rowKey="eduplusId" dataSource={classroom?.students ?? []} columns={columns} pagination={false} /><Button type="primary" disabled={errors.length > 0} onClick={() => void save()}>保存成绩草稿</Button></Card><CsvImportPanel examId={exam.id} /></Space>
}
