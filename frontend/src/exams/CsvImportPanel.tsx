import { Alert, Button, Card, Table, Upload } from 'antd'
import { useState } from 'react'
import { UploadOutlined } from '@ant-design/icons'
import { examApi } from './examApi'

export default function CsvImportPanel({ examId }: { examId: string }) {
  const [errors, setErrors] = useState<Array<{ rowNumber: number; code: string; message: string }>>([])
  const upload = async (file: File) => {
    const result = await examApi.importScores(examId, file.name, await readFile(file))
    setErrors(result.errors ?? [])
    return false
  }
  return <Card title="CSV 导入"><Upload accept=".csv,text/csv" maxCount={1} showUploadList={false} beforeUpload={(file) => { void upload(file); return false }}><Button icon={<UploadOutlined />}>选择 CSV 文件</Button></Upload>{errors.length > 0 && <><Alert type="error" message="CSV 校验失败，未写入任何成绩" showIcon /><Table rowKey={(row) => `${row.rowNumber}:${row.code}`} dataSource={errors} pagination={false} columns={[{ title: '行号', dataIndex: 'rowNumber' }, { title: '错误码', dataIndex: 'code' }, { title: '说明', dataIndex: 'message' }]} /></>}</Card>
}

function readFile(file: File) {
  if (typeof file.text === 'function') return file.text()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}
