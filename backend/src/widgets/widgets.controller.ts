import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { EXAMINATION_WIDGET_KEYS, EXAMINATION_WIDGETS, ExaminationWidgetKey } from './widget-catalog'

@Controller('v1/open/demo-school/widgets')
export class WidgetsController {
  @Get('schema')
  schema() {
    return {
      schema_version: '1.0',
      generated_at: new Date().toISOString(),
      widgets: EXAMINATION_WIDGETS,
    }
  }

  @Get('diagnostics/:widgetKey')
  diagnostics(@Param('widgetKey') widgetKey: string) {
    if (!EXAMINATION_WIDGET_KEYS.has(widgetKey)) {
      throw new NotFoundException('UNKNOWN_WIDGET')
    }
    return diagnosticPayload(widgetKey as ExaminationWidgetKey)
  }
}

function diagnosticPayload(widgetKey: ExaminationWidgetKey) {
  switch (widgetKey) {
    case 'exam-latest-summary':
      return {
        code: 0,
        sandboxed: true,
        data: { title: null, total: null, average: null, class_rank: null },
      }
    case 'exam-score-table':
      return { code: 0, sandboxed: true, data: { rows: [] } }
    case 'exam-score-trend':
      return { code: 0, sandboxed: true, data: { items: [] } }
  }
}
