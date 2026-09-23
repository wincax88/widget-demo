import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { CSRF_COOKIE } from '../security/csrf.guard'
import { AuthService } from './auth.service'
import { SESSION_COOKIE } from './session.guard'

class HandoffRequest {
  @IsString()
  @IsNotEmpty()
  tenant_code!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @IsOptional()
  @IsString()
  state?: string
}

const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

const csrfCookieOptions = {
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

function setCsrfCookie(response: Response) {
  response.cookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), csrfCookieOptions)
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/handoff')
  async handoff(@Body() body: HandoffRequest, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.acceptHandoff(body.tenant_code, body.code)
    response.cookie(SESSION_COOKIE, session.rawSessionToken, sessionCookieOptions)
    setCsrfCookie(response)
    return { authenticated: true }
  }

  @Get('auth/login/:tenantCode')
  async login(@Param('tenantCode') tenantCode: string, @Res() response: Response) {
    const login = await this.auth.buildLogin(tenantCode)
    response.cookie('widget_demo_oauth_state', login.state, {
      ...sessionCookieOptions,
      maxAge: 5 * 60 * 1000,
    })
    return response.redirect(302, login.url)
  }

  @Get('auth/callback/:tenantCode')
  async callback(
    @Param('tenantCode') tenantCode: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (!code || !state || state !== request.cookies?.widget_demo_oauth_state) {
      throw new BadRequestException('Invalid OAuth callback state')
    }
    const session = await this.auth.acceptAuthorizationCode(tenantCode, code)
    response.clearCookie('widget_demo_oauth_state', sessionCookieOptions)
    response.cookie(SESSION_COOKIE, session.rawSessionToken, sessionCookieOptions)
    setCsrfCookie(response)
    return response.redirect(303, '/')
  }

  @Post('auth/logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.revoke(request.cookies?.[SESSION_COOKIE])
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions)
    response.clearCookie(CSRF_COOKIE, csrfCookieOptions)
    return { authenticated: false }
  }

  @Get('session')
  async session(@Req() request: Request) {
    const session = await this.auth.findSession(request.cookies?.[SESSION_COOKIE])
    if (!session) return { authenticated: false }
    return {
      authenticated: true,
      tenant: { code: session.tenant.code, name: session.tenant.name },
      identity: {
        id: session.identityId,
        type: session.identityType,
        name: session.person?.name,
      },
    }
  }
}
