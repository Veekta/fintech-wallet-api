import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WalletsService } from './wallets.service.js';
import { validateIdempotencyKey } from './utils/validate-idempotency-key.js';
import { TransferDto } from './dto/transfer.dto.js';
import { TransfersService } from './transfers.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    role: string;
  };
}

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly transfersService: TransfersService,
  ) {}

  @Get('me')
  getMyWallet(@Req() request: AuthenticatedRequest) {
    return this.walletsService.findByUserId(request.user.sub);
  }

  @Post('transfers')
  transfer(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: TransferDto,
  ) {
    const key = validateIdempotencyKey(idempotencyKey);

    return this.transfersService.transfer(request.user.sub, dto, key);
  }
}
