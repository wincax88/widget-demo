import { Card, Typography } from 'antd'
import { ExamResult, formatDateOnly } from './resultsApi'

const lineColor = '#1677ff'

export default function TrendChart({ results }: { results: ExamResult[] }) {
  const chronological = [...results].sort((left, right) => left.examDate.localeCompare(right.examDate))
  const totals = chronological.map((result) => result.total)
  const maximum = Math.max(...totals, 1)
  const minimum = Math.min(...totals, 0)
  const range = Math.max(maximum - minimum, 1)
  const points = totals
    .map((total, index) => {
      const x = totals.length === 1 ? 150 : 20 + (index * 260) / (totals.length - 1)
      const y = 100 - ((total - minimum) / range) * 70
      return `${x},${y}`
    })
    .join(' ')

  return (
    <Card title="成绩趋势">
      <figure style={{ margin: 0 }} aria-label="总分趋势图">
        <svg viewBox="0 0 300 120" role="img" aria-label="历次考试总分趋势" style={{ width: '100%', maxHeight: 220 }}>
          <line x1="20" y1="100" x2="280" y2="100" stroke="#d9d9d9" />
          <polyline points={points} fill="none" stroke={lineColor} strokeWidth="3" />
          {points.split(' ').map((point, index) => {
            const [cx, cy] = point.split(',')
            return <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="4" fill={lineColor} />
          })}
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{ width: 18, height: 4, borderRadius: 2, background: lineColor }} />
          <Typography.Text>总分趋势</Typography.Text>
        </div>
        <figcaption style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">{describeTrend(chronological)}</Typography.Text>
        </figcaption>
      </figure>
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table aria-label="历次考试总分" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
          <thead>
            <tr>
              <th style={cellStyle}>考试</th>
              <th style={cellStyle}>日期</th>
              <th style={cellStyle}>总分</th>
            </tr>
          </thead>
          <tbody>
            {chronological.map((result) => (
              <tr key={result.examId}>
                <td style={cellStyle}>{result.title}</td>
                <td style={cellStyle}>{formatDateOnly(result.examDate)}</td>
                <td style={cellStyle}>{result.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const cellStyle = { padding: '8px 12px', textAlign: 'left' as const, borderBottom: '1px solid #f0f0f0' }

function describeTrend(results: ExamResult[]) {
  const latest = results[results.length - 1]
  if (!latest) return '暂无可用的趋势数据。'
  const previous = results[results.length - 2]
  if (!previous) return `目前仅有一次已发布考试，总分 ${latest.total}。`
  const difference = latest.total - previous.total
  if (difference === 0) return `最近一次总分 ${latest.total}，与上次持平。`
  return `最近一次总分 ${latest.total}，较上次${difference > 0 ? '上升' : '下降'} ${Math.abs(difference)} 分。`
}
