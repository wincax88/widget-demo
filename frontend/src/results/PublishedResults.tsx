import { Alert, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import ResultSummary from './ResultSummary'
import TrendChart from './TrendChart'
import { ExamResult, formatDateOnly } from './resultsApi'

export default function PublishedResults({ results }: { results: ExamResult[] }) {
  const [selectedExamId, setSelectedExamId] = useState(results[0].examId)
  useEffect(() => {
    if (!results.some((result) => result.examId === selectedExamId)) {
      setSelectedExamId(results[0].examId)
    }
  }, [results, selectedExamId])
  const selected = results.find((result) => result.examId === selectedExamId) ?? results[0]

  return (
    <>
      <label>
        <Typography.Text strong>选择考试</Typography.Text>
        <select
          aria-label="选择考试"
          value={selected.examId}
          onChange={(event) => setSelectedExamId(event.target.value)}
          style={selectStyle}
        >
          {results.map((result) => (
            <option key={result.examId} value={result.examId}>
              {result.title} · {formatDateOnly(result.examDate)}
            </option>
          ))}
        </select>
      </label>
      {selected.isDemo && <Alert type="warning" showIcon message="演示数据，非真实成绩" description="排名仅针对演示组，不代表真实班级。" />}
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ResultSummary result={selected} />
        <TrendChart results={results} />
      </Space>
    </>
  )
}

const selectStyle = {
  display: 'block', width: '100%', maxWidth: 360, marginTop: 8,
  minHeight: 36, padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: 6,
  background: '#fff', color: 'rgba(0, 0, 0, 0.88)',
}
