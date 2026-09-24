import { PersonType, TenantStatus } from '@prisma/client'
import { AuthService } from './auth.service'

describe('AuthService synchronized student binding', () => {
  function setup(matches: Array<{ id: string }> = [{ id: 'synced-student-1' }]) {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1', code: 'main09', eduplusTenantId: '42', status: TenantStatus.ACTIVE,
        issuerUrl: 'https://issuer.example/realms/main09', jwksUri: null,
        credentials: [{ clientId: 'client-1' }],
      }) },
      person: {
        findMany: jest.fn().mockResolvedValue(matches),
        upsert: jest.fn().mockResolvedValue({ id: 'legacy-sub-person' }),
      },
      appSession: { create: jest.fn().mockResolvedValue({}) },
    }
    const config = { getOrThrow: jest.fn().mockReturnValue('https://eduplus.example') }
    const crypto = { decrypt: jest.fn().mockReturnValue('client-secret'), encrypt: jest.fn().mockReturnValue({
      ciphertext: 'encrypted', iv: 'iv', authenticationTag: 'tag',
    }) }
    const handoff = { exchange: jest.fn().mockResolvedValue({
      access_token: 'access-token', refresh_token: 'refresh-token',
      scope: 'openid profile email', refresh_expires_in: 1800,
    }) }
    const verifier = { verify: jest.fn().mockResolvedValue({
      sub: 'keycloak-sub', tenantId: '42', identityId: '901', identityType: PersonType.STUDENT,
      clientId: 'client-1', handoffType: 'app_launch',
    }) }
    return {
      service: new AuthService(prisma as never, config as never, crypto as never, handoff as never, verifier as never),
      prisma,
    }
  }

  it('uses the unique synchronized student for the application session', async () => {
    const { service, prisma } = setup()
    await service.acceptHandoff('main09', 'one-time-code')

    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', type: PersonType.STUDENT, eduplusUserId: '901', active: true },
      select: { id: true }, take: 2,
    })
    expect(prisma.appSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      personId: 'synced-student-1', identityId: '901', identityType: PersonType.STUDENT,
    }) })
    expect(prisma.person.upsert).not.toHaveBeenCalled()
  })

  it('rejects an ambiguous student mapping before creating a session', async () => {
    const { service, prisma } = setup([{ id: 'student-1' }, { id: 'student-2' }])
    await expect(service.acceptHandoff('main09', 'one-time-code')).rejects.toThrow('Ambiguous student identity')
    expect(prisma.appSession.create).not.toHaveBeenCalled()
  })
})
