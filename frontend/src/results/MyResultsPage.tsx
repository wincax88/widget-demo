import { Result, Space, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import PublishedResults from './PublishedResults'
import ResultsError from './ResultsError'
import { ExamResult, resultsApi } from './resultsApi'

export default function MyResultsPage({ tenantCode }: { tenantCode?: string }) {
  const [results, setResults] = useState<ExamResult[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setResults(null)
    setError(null)
    resultsApi.mine()
      .then((value) => { if (active) setResults(sortResults(value)) })
      .catch((cause) => { if (active) setError(cause) })
    return () => { active = false }
  }, [attempt])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>我的成绩</Typography.Title>
      {error !== null && <ResultsError cause={error} tenantCode={tenantCode} onRetry={() => setAttempt((value) => value + 1)} />}
      {!error && results === null && <Spin><span>正在加载成绩</span></Spin>}
      {results?.length === 0 && (
        <Result status="info" title="暂无已发布成绩" subTitle="考试发布后，成绩会显示在这里。" />
      )}
      {results && results.length > 0 && (
        <PublishedResults results={results} />
      )}
    </Space>
  )
}

export function sortResults(results: ExamResult[]) {
  return [...results].sort((left, right) => right.examDate.localeCompare(left.examDate))
}
