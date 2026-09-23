import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { Request } from 'express'
import { SESSION_COOKIE } from '../auth/session.guard'

export const CSRF_COOKIE = 'widget_demo_csrf'
export const CSRF_HEADER = 'x-csrf-token'

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      request.originalUrl.split('?', 1)[0] === '/api/webhooks/eduplus' ||
      !request.cookies?.[SESSION_COOKIE]
    ) {
      return true
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE]
    const header = request.headers[CSRF_HEADER]
    const headerToken = Array.isArray(header) ? header[0] : header
    if (!this.matches(cookieToken, headerToken)) {
      throw new ForbiddenException('A matching CSRF token is required')
    }
    return true
  }

  private matches(cookieToken?: string, headerToken?: string) {
    if (!cookieToken || !headerToken) return false
    const cookie = Buffer.from(cookieToken)
    const candidate = Buffer.from(headerToken)
    return cookie.length === candidate.length && timingSafeEqual(cookie, candidate)
  }
}
