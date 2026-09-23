import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DirectorySyncController } from './directory-sync.controller'
import { DirectorySyncService } from './directory-sync.service'
import { EduplusDirectoryClient } from './eduplus-directory.client'

@Module({
  imports: [AuthModule],
  controllers: [DirectorySyncController],
  providers: [DirectorySyncService, EduplusDirectoryClient],
})
export class DirectorySyncModule {}
