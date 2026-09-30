import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AiCenterController } from './ai-center.controller'
import { AiCenterService } from './ai-center.service'

@Module({ imports: [AuthModule], controllers: [AiCenterController], providers: [AiCenterService] })
export class AiCenterModule {}
