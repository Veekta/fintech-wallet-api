import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { TransfersService } from './transfers.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { TransactionHistoryService } from './transaction-history.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WalletsController],
  providers: [WalletsService, TransfersService, TransactionHistoryService],
})
export class WalletsModule {}
