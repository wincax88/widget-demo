import { Result, Space, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import PublishedResults from './PublishedResults'
import ResultsError from './ResultsError'
import { AuthorizedChild, ExamResult, resultsApi } from './resultsApi'
import { sortResults } from './MyResultsPage'

export default function ChildResultsPage({ tenantCode }: { tenantCode?: string }) {
  const [children, setChildren] = useState<AuthorizedChild[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [results, setResults] = useState<ExamResult[] | null>(null)
  const [error, setError] = useState<{ cause: unknown; phase: 'children' | 'results' } | null>(null)
  const [childrenAttempt, setChildrenAttempt] = useState(0)
  const [resultsAttempt, setResultsAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setChildren(null)
    setError(null)
    resultsApi.children()
      .then((authorized) => {
        if (!active) return
        setChildren(authorized)
        setSelectedId(authorized[0]?.id ?? null)
      })
      .catch((cause) => { if (active) setError({ cause, phase: 'children' }) })
    return () => { active = false }
  }, [childrenAttempt])

  useEffect(() => {
    if (!selectedId || !children?.some((child) => child.id === selectedId)) return
    let active = true
    setResults(null)
    setError(null)
    resultsApi.child(selectedId)
      .then((value) => { if (active) setResults(sortResults(value)) })
      .catch((cause) => { if (active) setError({ cause, phase: 'results' }) })
    return () => { active = false }
  }, [children, selectedId, resultsAttempt])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>子女成绩</Typography.Title>
      {error && (
        <ResultsError
          cause={error.cause}
          tenantCode={tenantCode}
          onRetry={() => error.phase === 'children'
            ? setChildrenAttempt((value) => value + 1)
            : setResultsAttempt((value) => value + 1)}
        />
      )}
      {!error && children === null && <Spin><span>正在加载关联子女</span></Spin>}
      {children?.length === 0 && (
        <Result status="info" title="暂无可查看的关联子女" subTitle="请联系学校确认家长与学生的关联关系。" />
      )}
      {children && children.length > 0 && (
        <>
          <label>
            <Typography.Text strong>选择子女</Typography.Text>
            <select
              aria-label="选择子女"
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
              style={{ display: 'block', width: '100%', maxWidth: 280, minHeight: 36, marginTop: 8, padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff' }}
            >
              {children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
            </select>
          </label>
          {!error && results === null && <Spin><span>正在加载成绩</span></Spin>}
          {results?.length === 0 && (
            <Result status="info" title="暂无已发布成绩" subTitle="考试发布后，成绩会显示在这里。" />
          )}
          {results && results.length > 0 && (
            <PublishedResults results={results} />
          )}
        </>
      )}
    </Space>
  )
}
