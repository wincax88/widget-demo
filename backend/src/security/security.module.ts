import {
  ArgumentsHost,
  Catch,
  ConsoleLogger,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
} from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { Response } from 'express'
import { CsrfGuard } from './csrf.guard'
import {
  BoundaryRateLimitGuard,
  JsonContentTypeGuard,
  JsonOnly,
  OriginGuard,
  WidgetRoute,
} from './origin.guard'

const REDACTED_KEYS = new Set([
  'authorization',
  'cookie',
  'client_secret',
  'handoff_code',
  'access_token',
  'refresh_token',
  'refresh_session_id',
])

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactSecrets(entry),
    ]),
  )
}

@Injectable()
export class RedactingLogger extends ConsoleLogger {
  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    super.error(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    super.debug(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    super.verbose(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    super.fatal(redactSecrets(message), ...optionalParams.map(redactSecrets))
  }
}

@Catch()
@Injectable()
export class RedactingExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: RedactingLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(redactSecrets(exception.getResponse()))
    }
    this.logger.error(exception)
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }
}

@Module({
  providers: [
    RedactingLogger,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JsonContentTypeGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: BoundaryRateLimitGuard },
    { provide: APP_FILTER, useClass: RedactingExceptionFilter },
  ],
  exports: [RedactingLogger],
})
export class SecurityModule {}

export { JsonOnly, WidgetRoute }
