import { createHmac } from 'node:crypto'
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { WebhookSignatureService } from './webhook-signature.service'

describe('WebhookSignatureService', () => {
  const secret = 'whsec_test'
  const service = new WebhookSignatureService(new ConfigService({ EDUPLUS_WEBHOOK_SECRET: secret }))
  const body = Buffer.from('{"event":"subscription.created"}')

  function headers(timestamp = Math.floor(Date.now() / 1000).toString()) {
    const eventName = 'subscription.created'
    const canonical = `${timestamp}.${eventName}.${body.toString('utf8')}`
    const signature = createHmac('sha256', secret).update(canonical).digest('hex')
    return {
      'x-eduplus-timestamp': timestamp,
      'x-eduplus-event': eventName,
      'x-eduplus-signature': `sha256=${signature}`,
    }
  }

  it('accepts the documented raw-body signature', () => {
    expect(() => service.verify(body, headers())).not.toThrow()
  })

  it('rejects a signature mismatch', () => {
    expect(() =>
      service.verify(body, { ...headers(), 'x-eduplus-signature': `sha256=${'0'.repeat(64)}` }),
    ).toThrow(UnauthorizedException)
  })

  it('rejects timestamps older than five minutes', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000 - 301).toString()
    expect(() => service.verify(body, headers(oldTimestamp))).toThrow(UnauthorizedException)
  })
})
