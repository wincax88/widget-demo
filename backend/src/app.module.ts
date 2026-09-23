import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { validateEnv } from './config/env.schema'
import { DirectorySyncModule } from './directory-sync/directory-sync.module'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    SubscriptionsModule,
    AuthModule,
    DirectorySyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
