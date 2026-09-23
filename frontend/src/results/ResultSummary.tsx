import { Card, Col, Row, Statistic, Typography } from 'antd'
import { ExamResult, formatDateOnly } from './resultsApi'

export default function ResultSummary({ result }: { result: ExamResult }) {
  return (
    <Card title={result.title} extra={formatDateOnly(result.examDate)}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <Statistic title="总分" value={result.total} />
        </Col>
        <Col xs={12} md={8}>
          <Statistic title="平均分" value={result.average} precision={displayPrecision(result.average)} />
        </Col>
        <Col xs={12} md={8}>
          <Statistic title="班级排名" value={result.classRank ?? '—'} />
        </Col>
      </Row>

      <Typography.Title level={4} style={{ marginTop: 24 }}>
        各科成绩
      </Typography.Title>
      <div style={{ overflowX: 'auto' }}>
        <table aria-label={`${result.title}各科成绩`} style={tableStyle}>
          <thead>
            <tr>
              <th style={headerCellStyle}>科目</th>
              <th style={headerCellStyle}>成绩</th>
              <th style={headerCellStyle}>满分</th>
              <th style={headerCellStyle}>科目排名</th>
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((subject) => (
              <tr key={subject.id}>
                <td style={cellStyle}>{subject.name}</td>
                <td style={cellStyle}>{subject.absent ? '缺考' : (subject.score ?? '—')}</td>
                <td style={cellStyle}>{subject.maximumScore}</td>
                <td style={cellStyle}>{subject.rank === null ? '—' : `第 ${subject.rank} 名`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, minWidth: 480 }
const headerCellStyle = { textAlign: 'left' as const, padding: '12px 16px', background: '#f5f7fa', borderBottom: '1px solid #e5e7eb' }
const cellStyle = { padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }

function displayPrecision(value: number) {
  return Number.isInteger(value) ? 0 : 1
}
