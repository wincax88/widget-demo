import { BadRequestException, Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common'
import { Request } from 'express'
import { SubscriptionsService } from './subscriptions.service'

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post('webhooks/eduplus')
  @HttpCode(200)
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Raw webhook body is required')
    }
    return this.subscriptions.receive(request.rawBody, headers)
  }
}
