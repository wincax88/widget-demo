import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request = require('supertest')
import { configureApp } from '../main'
import { EXAMINATION_WIDGETS } from './widget-catalog'
import { WidgetsModule } from './widgets.module'

describe('examination widget catalog', () => {
  it('publishes stable, unique schemas supported by the EduPlus workbench', () => {
    expect(EXAMINATION_WIDGETS.map((widget) => widget.widget_key)).toEqual([
      'exam-latest-summary',
      'exam-score-table',
      'exam-score-trend',
    ])
    expect(new Set(EXAMINATION_WIDGETS.map((widget) => widget.widget_key)).size).toBe(EXAMINATION_WIDGETS.length)
    expect(EXAMINATION_WIDGETS.map((widget) => widget.widget_type)).toEqual([
      'stat-card', 'table', 'timeline',
    ])
    expect(EXAMINATION_WIDGETS.map((widget) => widget.applicable_roles)).toEqual([
      'student,parent',
      'teacher,student,parent',
      'student,parent',
    ])
    expect(EXAMINATION_WIDGETS[1].fields).toMatchObject({ itemsPath: 'rows' })
    expect(EXAMINATION_WIDGETS[2].fields).toMatchObject({ itemsPath: 'items' })

    for (const widget of EXAMINATION_WIDGETS) {
      expect(widget.data_source.url).toMatch(/^\/v1\/open\/demo-school\/widgets\/diagnostics\//)
      expect(widget.data_source.url).not.toMatch(/^https?:/)
      expect(widget.data_source.method).toBe('GET')
      expect(widget.data_source.refreshInterval).toBeGreaterThanOrEqual(30)
      expect(fieldPaths(widget.fields)).not.toContainEqual(expect.stringMatching(/\s|\.\.|^\.|\.$/))
    }
  })
})

describe('widget schema HTTP boundary', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            APP_ORIGIN: 'https://exam.example.com',
            EDUPLUS_WORKBENCH_ORIGIN: 'https://eduplus.example.com',
          })],
        }),
        WidgetsModule,
      ],
    }).compile()
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false })
    configureApp(app as NestExpressApplication)
    await app.init()
  })

  afterAll(async () => app.close())

  it('serves schema on the public path without the application API prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/open/demo-school/widgets/schema')
      .expect(200)

    expect(response.body.schema_version).toBe('1.0')
    expect(Date.parse(response.body.generated_at)).not.toBeNaN()
    expect(response.body.widgets).toEqual(EXAMINATION_WIDGETS)
    await request(app.getHttpServer()).get('/api/v1/open/demo-school/widgets/schema').expect(404)
  })

  it.each(EXAMINATION_WIDGETS)('returns sandboxed empty diagnostic data for $widget_key', async (widget) => {
    const response = await request(app.getHttpServer()).get(widget.data_source.url).expect(200)
    expect(response.body).toMatchObject({ code: 0, sandboxed: true })
    expect(JSON.stringify(response.body)).not.toMatch(/张三|mock|example/i)
  })
})

function fieldPaths(value: unknown, key = ''): string[] {
  if (typeof value === 'string') {
    return ['title', 'dataIndex'].includes(key) ? [] : [value]
  }
  if (Array.isArray(value)) return value.flatMap((item) => fieldPaths(item))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([childKey, child]) => fieldPaths(child, childKey))
}
