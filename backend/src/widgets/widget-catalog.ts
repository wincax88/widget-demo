export type WidgetType = 'stat-card' | 'table' | 'timeline'

export interface WidgetSchema {
  widget_key: string
  schema_version: '1.0'
  component_version: string
  name: string
  description: string
  widget_type: WidgetType
  data_source: {
    url: string
    method: 'GET'
    refreshInterval: number
  }
  fields: Record<string, unknown>
  default_layout: {
    w: number
    h: number
    minW: number
    minH: number
    maxW: number
    maxH: number
  }
  show_refresh: boolean
  category: string
  applicable_roles: string
}

const diagnosticBase = '/v1/open/demo-school/widgets/diagnostics'

export const EXAMINATION_WIDGETS = [
  {
    widget_key: 'exam-latest-summary',
    schema_version: '1.0',
    component_version: '1.0.0',
    name: '最近考试概览',
    description: '展示最近一次已发布考试的总分、平均分和班级排名',
    widget_type: 'stat-card',
    data_source: {
      url: `${diagnosticBase}/exam-latest-summary`,
      method: 'GET',
      refreshInterval: 300,
    },
    fields: {
      stat: {
        考试: 'title',
        总分: 'total',
        平均分: 'average',
        班级排名: 'class_rank',
      },
    },
    default_layout: { w: 6, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 8 },
    show_refresh: true,
    category: 'learning',
    applicable_roles: 'student,parent',
  },
  {
    widget_key: 'exam-score-table',
    schema_version: '1.0',
    component_version: '1.0.0',
    name: '最近考试各科成绩',
    description: '展示最近一次已发布考试的科目成绩和排名',
    widget_type: 'table',
    data_source: {
      url: `${diagnosticBase}/exam-score-table`,
      method: 'GET',
      refreshInterval: 300,
    },
    fields: {
      itemsPath: 'rows',
      columns: [
        { title: '学生', dataIndex: 'student_name' },
        { title: '科目', dataIndex: 'subject' },
        { title: '成绩', dataIndex: 'score' },
        { title: '科目排名', dataIndex: 'rank' },
      ],
    },
    default_layout: { w: 12, h: 8, minW: 8, minH: 5, maxW: 18, maxH: 16 },
    show_refresh: true,
    category: 'learning',
    applicable_roles: 'teacher,student,parent',
  },
  {
    widget_key: 'exam-score-trend',
    schema_version: '1.0',
    component_version: '1.0.0',
    name: '成绩变化趋势',
    description: '按考试日期展示历次已发布考试的总分变化',
    widget_type: 'timeline',
    data_source: {
      url: `${diagnosticBase}/exam-score-trend`,
      method: 'GET',
      refreshInterval: 600,
    },
    fields: {
      itemsPath: 'items',
      item: {
        id: 'exam_id',
        title: 'title',
        description: 'summary',
        time: 'exam_date',
      },
    },
    default_layout: { w: 12, h: 8, minW: 8, minH: 5, maxW: 18, maxH: 16 },
    show_refresh: true,
    category: 'learning',
    applicable_roles: 'student,parent',
  },
] as const satisfies readonly WidgetSchema[]

export type ExaminationWidgetKey = (typeof EXAMINATION_WIDGETS)[number]['widget_key']

export const EXAMINATION_WIDGET_KEYS = new Set<string>(
  EXAMINATION_WIDGETS.map((widget) => widget.widget_key),
)
