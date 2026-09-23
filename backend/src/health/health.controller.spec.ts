import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns a stable readiness payload', () => {
    expect(new HealthController().ready()).toEqual({ status: 'ok' })
  })
})
