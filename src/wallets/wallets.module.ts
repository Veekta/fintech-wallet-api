import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { TransfersService } from './transfers.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [WalletsController],
  providers: [WalletsService, TransfersService],
})
export class WalletsModule {}
