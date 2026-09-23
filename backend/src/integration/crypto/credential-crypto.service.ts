import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface EncryptedCredential {
  ciphertext: Uint8Array
  iv: Uint8Array
  authenticationTag: Uint8Array
}

@Injectable()
export class CredentialCryptoService {
  private readonly key: Buffer

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('CREDENTIAL_ENCRYPTION_KEY'), 'base64url')
    if (this.key.length !== 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes')
    }
  }

  encrypt(value: string): EncryptedCredential {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { ciphertext, iv, authenticationTag: cipher.getAuthTag() }
  }

  decrypt(value: EncryptedCredential): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv))
    decipher.setAuthTag(Buffer.from(value.authenticationTag))
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext)), decipher.final()]).toString(
      'utf8',
    )
  }
}
