import { Module } from '@nestjs/common'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { PrismaModule } from '../prisma/prisma.module'
import { WidgetsController } from './widgets.controller'
import { WidgetRefreshSessionService } from './widget-refresh-session.service'

@Module({
  imports: [PrismaModule],
  controllers: [WidgetsController],
  providers: [CredentialCryptoService, WidgetRefreshSessionService],
  exports: [WidgetRefreshSessionService],
})
export class WidgetsModule {}
