import { RequestMethod, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser = require('cookie-parser')
import { json, Request, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { RedactingLogger } from './security/security.module'

type RequestWithRawBody = Request & { rawBody?: Buffer }

export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService)
  const allowedOrigins = new Set([
    config.get<string>('APP_ORIGIN'),
    config.get<string>('EDUPLUS_WORKBENCH_ORIGIN'),
  ])
  app.useLogger(new RedactingLogger('Application'))
  app.enableCors({
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin))
    },
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-csrf-token',
      'x-eduplus-timestamp',
      'x-eduplus-event',
      'x-eduplus-signature',
    ],
  })
  app.use(helmet())
  app.use(cookieParser())

  const captureWebhookBody = (request: RequestWithRawBody, _response: unknown, buffer: Buffer) => {
    if (request.originalUrl.startsWith('/api/webhooks/eduplus')) {
      request.rawBody = Buffer.from(buffer)
    }
  }

  app.use(json({ limit: '1mb', verify: captureWebhookBody }))
  app.use(urlencoded({ extended: true, limit: '1mb' }))
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'v1/open/{*path}', method: RequestMethod.ALL }],
  })
  return app
}

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })
  configureApp(app)

  await app.listen(process.env.PORT ?? 8888)
  return app
}

if (require.main === module) {
  void bootstrap()
}
