import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'

export const SESSION_COOKIE = 'widget_demo_session'

export type AuthenticatedRequest = Request & {
  appSession?: NonNullable<Awaited<ReturnType<AuthService['findSession']>>>
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const session = await this.auth.findSession(request.cookies?.[SESSION_COOKIE])
    if (!session) {
      throw new UnauthorizedException('Application session is required')
    }
    request.appSession = session
    return true
  }
}
