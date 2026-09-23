import { ConfigService } from '@nestjs/config'
import { CredentialCryptoService } from './credential-crypto.service'

describe('CredentialCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64url')
  const service = new CredentialCryptoService(
    new ConfigService({ CREDENTIAL_ENCRYPTION_KEY: key }),
  )

  it('round-trips a secret with AES-256-GCM', () => {
    const encrypted = service.encrypt('client-secret')

    expect(encrypted.ciphertext).not.toContain(Buffer.from('client-secret'))
    expect(service.decrypt(encrypted)).toBe('client-secret')
  })

  it('rejects modified ciphertext', () => {
    const encrypted = service.encrypt('client-secret')
    encrypted.ciphertext[0] ^= 1

    expect(() => service.decrypt(encrypted)).toThrow()
  })

  it('authenticates optional associated context data', () => {
    const encrypted = service.encrypt('client-secret', Buffer.from('tenant-a'))

    expect(service.decrypt(encrypted, Buffer.from('tenant-a'))).toBe('client-secret')
    expect(() => service.decrypt(encrypted, Buffer.from('tenant-b'))).toThrow()
  })
})
