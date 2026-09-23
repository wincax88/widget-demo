import { Module } from '@nestjs/common'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { HandoffClient } from '../integration/eduplus/handoff-client'
import { OidcVerifier } from '../integration/eduplus/oidc-verifier'
import { PrismaModule } from '../prisma/prisma.module'
import { ResultsModule } from '../results/results.module'
import { WidgetsController } from './widgets.controller'
import { WidgetAuthService } from './widget-auth.service'
import { WidgetDataService } from './widget-data.service'
import { WidgetRefreshSessionService } from './widget-refresh-session.service'

@Module({
  imports: [PrismaModule, ResultsModule],
  controllers: [WidgetsController],
  providers: [
    CredentialCryptoService,
    HandoffClient,
    OidcVerifier,
    WidgetRefreshSessionService,
    WidgetAuthService,
    WidgetDataService,
  ],
  exports: [WidgetRefreshSessionService],
})
export class WidgetsModule {}
