import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'node:crypto'

type WebhookHeaders = Record<string, string | string[] | undefined>

@Injectable()
export class WebhookSignatureService {
  private readonly secret: string

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('EDUPLUS_WEBHOOK_SECRET')
  }

  verify(rawBody: Buffer, headers: WebhookHeaders) {
    const timestamp = this.header(headers, 'x-eduplus-timestamp')
    const eventName = this.header(headers, 'x-eduplus-event')
    const signatureHeader = this.header(headers, 'x-eduplus-signature')
    const requestTime = Number(timestamp)

    if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() / 1000 - requestTime) > 300) {
      throw new UnauthorizedException('Webhook timestamp is outside the allowed window')
    }

    const actualHex = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length)
      : ''
    if (!/^[a-f0-9]{64}$/i.test(actualHex)) {
      throw new UnauthorizedException('Invalid webhook signature')
    }

    const canonical = `${timestamp}.${eventName}.${rawBody.toString('utf8')}`
    const expected = createHmac('sha256', this.secret).update(canonical).digest()
    const actual = Buffer.from(actualHex, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid webhook signature')
    }

    return { eventName, timestamp: requestTime }
  }

  private header(headers: WebhookHeaders, name: string) {
    const value = headers[name] ?? headers[name.toLowerCase()]
    if (typeof value !== 'string' || value.length === 0) {
      throw new UnauthorizedException(`Missing ${name} header`)
    }
    return value
  }
}
