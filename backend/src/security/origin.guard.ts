import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'

const WIDGET_ROUTE = 'security:widget-route'
const JSON_ONLY = 'security:json-only'

export const WidgetRoute = () => SetMetadata(WIDGET_ROUTE, true)
export const JsonOnly = () => SetMetadata(JSON_ONLY, true)

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const isWidgetRoute = this.reflector.getAllAndOverride<boolean>(WIDGET_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!isWidgetRoute) return true

    const origin = context.switchToHttp().getRequest<Request>().headers.origin
    const allowed = new Set([
      this.config.get<string>('APP_ORIGIN'),
      this.config.get<string>('EDUPLUS_WORKBENCH_ORIGIN'),
    ])
    if (!origin || !allowed.has(origin)) {
      throw new ForbiddenException('Request origin is not allowed')
    }
    return true
  }
}

@Injectable()
export class JsonContentTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const jsonOnly = this.reflector.getAllAndOverride<boolean>(JSON_ONLY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!jsonOnly) return true

    const request = context.switchToHttp().getRequest<Request>()
    const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase()
    if (contentType !== 'application/json' && !contentType?.match(/^application\/[\w.+-]+\+json$/)) {
      throw new UnsupportedMediaTypeException('Content-Type must be application/json')
    }
    return true
  }
}

type RateBucket = { count: number; resetAt: number }

@Injectable()
export class BoundaryRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>()

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    const path = request.originalUrl.split('?', 1)[0]
    const boundary = path.startsWith('/api/auth/')
      ? 'auth'
      : path === '/api/webhooks/eduplus'
        ? 'webhook'
        : null
    if (!boundary) return true

    const maximum = this.numberSetting(
      boundary === 'auth' ? 'AUTH_RATE_LIMIT_MAX' : 'WEBHOOK_RATE_LIMIT_MAX',
      boundary === 'auth' ? 30 : 120,
    )
    const windowMs = this.numberSetting('RATE_LIMIT_WINDOW_MS', 60_000)
    const key = `${boundary}:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`
    const now = Date.now()
    const current = this.buckets.get(key)
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current
    bucket.count += 1
    this.buckets.set(key, bucket)
    if (bucket.count > maximum) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
    }
    return true
  }

  private numberSetting(name: string, fallback: number) {
    const value = Number(this.config.get(name) ?? fallback)
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
}
