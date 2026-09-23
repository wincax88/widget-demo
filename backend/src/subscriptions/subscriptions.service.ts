import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CredentialKind, Prisma, TenantStatus } from '@prisma/client'
import { createHash } from 'node:crypto'
import { CredentialCryptoService } from '../integration/crypto/credential-crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { WebhookSignatureService } from './webhook-signature.service'

type Headers = Record<string, string | string[] | undefined>

interface WebhookPayload {
  event: string
  event_id: string
  tenant: { id: string | number; code: string; name: string }
  oauth_client?: {
    client_id: string
    client_secret: string
    auth_server_url?: string
  }
  credential?: {
    client_id?: string
    new_secret?: string
  }
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: WebhookSignatureService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async receive(rawBody: Buffer, headers: Headers) {
    const { eventName } = this.signatures.verify(rawBody, headers)
    const payload = this.parsePayload(rawBody)
    if (payload.event !== eventName) {
      throw new BadRequestException('Webhook event header does not match payload')
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.webhookReceipt.findUnique({
          where: { eventId: payload.event_id },
          select: { eventId: true },
        })
        if (existing) {
          return { accepted: true, duplicate: true }
        }

        await transaction.webhookReceipt.create({
          data: {
            eventId: payload.event_id,
            eventName: payload.event,
            payloadHash: createHash('sha256').update(rawBody).digest('hex'),
          },
        })
        const tenant = await this.applyEvent(transaction, payload)
        await transaction.webhookReceipt.update({
          where: { eventId: payload.event_id },
          data: { tenantId: tenant?.id },
        })
        return { accepted: true, duplicate: false }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { accepted: true, duplicate: true }
      }
      throw error
    }
  }

  private parsePayload(rawBody: Buffer): WebhookPayload {
    let payload: Partial<WebhookPayload>
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Partial<WebhookPayload>
    } catch {
      throw new BadRequestException('Webhook body must be valid JSON')
    }
    if (
      typeof payload.event !== 'string' ||
      typeof payload.event_id !== 'string' ||
      typeof payload.tenant?.code !== 'string' ||
      payload.tenant.code.length === 0
    ) {
      throw new BadRequestException('Webhook payload is missing required fields')
    }
    return payload as WebhookPayload
  }

  private async applyEvent(transaction: Prisma.TransactionClient, payload: WebhookPayload) {
    if (payload.event === 'subscription.created') {
      const oauth = payload.oauth_client
      if (!oauth?.client_id || !oauth.client_secret) {
        throw new BadRequestException('subscription.created requires oauth_client credentials')
      }
      const tenant = await transaction.tenant.upsert({
        where: { code: payload.tenant.code },
        create: {
          code: payload.tenant.code,
          eduplusTenantId: String(payload.tenant.id),
          name: payload.tenant.name,
          issuerUrl: oauth.auth_server_url,
          status: TenantStatus.ACTIVE,
        },
        update: {
          eduplusTenantId: String(payload.tenant.id),
          name: payload.tenant.name,
          issuerUrl: oauth.auth_server_url,
          status: TenantStatus.ACTIVE,
        },
      })
      await this.saveOauthCredential(transaction, tenant.id, oauth.client_id, oauth.client_secret)
      return tenant
    }

    const tenant = await transaction.tenant.findUnique({ where: { code: payload.tenant.code } })
    if (!tenant) {
      throw new NotFoundException('Webhook tenant has not been initialized')
    }

    if (payload.event === 'subscription.suspended') {
      return transaction.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.SUSPENDED },
      })
    }
    if (payload.event === 'subscription.reactivated') {
      return transaction.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.ACTIVE },
      })
    }
    if (['subscription.terminated', 'subscription.expired'].includes(payload.event)) {
      return transaction.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.REVOKED },
      })
    }
    if (payload.event === 'credential.rotated') {
      if (!payload.credential?.client_id || !payload.credential.new_secret) {
        throw new BadRequestException('credential.rotated requires a new secret')
      }
      await this.saveOauthCredential(
        transaction,
        tenant.id,
        payload.credential.client_id,
        payload.credential.new_secret,
      )
    }
    if (payload.event === 'credential.revoked') {
      await transaction.tenantCredential.updateMany({
        where: {
          tenantId: tenant.id,
          kind: CredentialKind.OAUTH_CLIENT_SECRET,
          ...(payload.credential?.client_id ? { clientId: payload.credential.client_id } : {}),
        },
        data: { revokedAt: new Date() },
      })
    }
    return tenant
  }

  private async saveOauthCredential(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
    secret: string,
  ) {
    const encrypted = this.crypto.encrypt(secret)
    await transaction.tenantCredential.upsert({
      where: { tenantId_kind: { tenantId, kind: CredentialKind.OAUTH_CLIENT_SECRET } },
      create: {
        tenantId,
        kind: CredentialKind.OAUTH_CLIENT_SECRET,
        clientId,
        ...encrypted,
      },
      update: { clientId, ...encrypted, revokedAt: null },
    })
  }
}
