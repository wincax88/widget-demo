import { Body, Controller, Get, Header, Headers, NotFoundException, Param, Post } from '@nestjs/common'
import { JsonOnly, WidgetRoute } from '../security/security.module'
import { EXAMINATION_WIDGET_KEYS, EXAMINATION_WIDGETS, ExaminationWidgetKey } from './widget-catalog'
import {
  WidgetAuthRequest,
  WidgetAuthService,
  WidgetRefreshRequest,
} from './widget-auth.service'
import { WidgetBatchRequest, WidgetDataService } from './widget-data.service'

@Controller('v1/open/demo-school/widgets')
export class WidgetsController {
  constructor(
    private readonly auth: WidgetAuthService,
    private readonly data: WidgetDataService,
  ) {}

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

  @Post('auth')
  @WidgetRoute()
  @JsonOnly()
  @Header('Cache-Control', 'no-store')
  authorize(@Body() body: WidgetAuthRequest) {
    return this.auth.authorize(body)
  }

  @Post('token/refresh')
  @WidgetRoute()
  @JsonOnly()
  @Header('Cache-Control', 'no-store')
  refresh(
    @Body() body: WidgetRefreshRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return this.auth.refresh(body, authorization)
  }

  @Post('batch-data')
  @WidgetRoute()
  @JsonOnly()
  @Header('Cache-Control', 'no-store')
  batch(
    @Body() body: WidgetBatchRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return this.data.batch(body, authorization)
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
