import { parseDemoSeedArgs } from './demo-exam-cli'

describe('demonstration exam seed command', () => {
  it('defaults to read-only preview for main09', () => {
    expect(parseDemoSeedArgs(['--tenant=main09'])).toEqual({ tenantCode: 'main09', apply: false })
  })

  it('requires explicit main09 confirmation before a write', () => {
    expect(() => parseDemoSeedArgs(['--tenant=main09', '--apply'])).toThrow('confirmation')
    expect(parseDemoSeedArgs(['--tenant=main09', '--apply', '--confirm=main09'])).toEqual({
      tenantCode: 'main09', apply: true,
    })
  })

  it('rejects another tenant and unknown arguments', () => {
    expect(() => parseDemoSeedArgs(['--tenant=other'])).toThrow('main09')
    expect(() => parseDemoSeedArgs(['--tenant=main09', '--all'])).toThrow('Unknown')
  })
})
