import { Module } from '@nestjs/common'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { SubscriptionsController } from './subscriptions.controller'
import { SubscriptionsService } from './subscriptions.service'
import { WebhookSignatureService } from './webhook-signature.service'

@Module({
  controllers: [SubscriptionsController],
  providers: [CredentialCryptoService, SubscriptionsService, WebhookSignatureService],
  exports: [CredentialCryptoService],
})
export class SubscriptionsModule {}
