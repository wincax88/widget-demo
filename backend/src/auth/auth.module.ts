import { Module } from '@nestjs/common'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { HandoffClient } from '../integration/eduplus/handoff-client'
import { OidcVerifier } from '../integration/eduplus/oidc-verifier'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SessionGuard } from './session.guard'

@Module({
  controllers: [AuthController],
  providers: [CredentialCryptoService, HandoffClient, OidcVerifier, AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
