import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { TransfersService } from './transfers.service.js';
import { TransactionHistoryService } from './transaction-history.service.js';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

describe('WalletsController', () => {
  let controller: WalletsController;

  let walletsService: {
    findByUserId: ReturnType<typeof vi.fn>;
  };

  let transfersService: {
    transfer: ReturnType<typeof vi.fn>;
  };

  let transactionHistoryService: {
    findByUserId: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    walletsService = {
      findByUserId: vi.fn(),
    };

    transfersService = {
      transfer: vi.fn(),
    };

    transactionHistoryService = {
      findByUserId: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        { provide: WalletsService, useValue: walletsService },
        { provide: TransfersService, useValue: transfersService },
        {
          provide: TransactionHistoryService,
          useValue: transactionHistoryService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the authenticated user’s wallet', async () => {
    const wallet = {
      id: 'wallet-123',
      currency: 'NGN',
      balance: '500.00',
      status: 'ACTIVE',
    };

    walletsService.findByUserId.mockResolvedValue(wallet);

    const result = await controller.getMyWallet({
      user: { sub: 'user-123', role: 'USER' },
    } as never);

    expect(result).toEqual(wallet);
    expect(walletsService.findByUserId).toHaveBeenCalledWith('user-123');
  });

  it('passes the authenticated user and filters to TransactionHistoryService', async () => {
    const query = {
      type: 'TRANSFER',
      status: 'COMPLETED',
      page: 1,
      limit: 20,
    } as TransactionHistoryQueryDto;

    const historyResult = {
      data: [
        {
          id: 'transaction-123',
          type: 'TRANSFER',
          status: 'COMPLETED',
          amount: '100.00',
          currency: 'NGN',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    };

    transactionHistoryService.findByUserId.mockResolvedValue(historyResult);

    const result = await controller.getTransactionHistory(
      {
        user: { sub: 'user-123', role: 'USER' },
      } as never,
      query,
    );

    expect(result).toEqual(historyResult);
    expect(transactionHistoryService.findByUserId).toHaveBeenCalledWith(
      'user-123',
      query,
    );
  });

  it('passes the authenticated user, DTO, and idempotency key to TransfersService', async () => {
    const dto = {
      destinationWalletId: '550e8400-e29b-41d4-a716-446655440000',
      amount: '100.00',
    };

    const transferResult = {
      id: 'transaction-123',
      type: 'TRANSFER',
      status: 'COMPLETED',
      amount: '100.00',
      currency: 'NGN',
    };

    transfersService.transfer.mockResolvedValue(transferResult);

    const result = await controller.transfer(
      {
        user: { sub: 'user-123', role: 'USER' },
      } as never,
      'transfer-key-123',
      dto,
    );

    expect(result).toEqual(transferResult);
    expect(transfersService.transfer).toHaveBeenCalledWith(
      'user-123',
      dto,
      'transfer-key-123',
    );
  });

  it('rejects a transfer when the idempotency key is missing', () => {
    expect(() =>
      controller.transfer(
        {
          user: { sub: 'user-123', role: 'USER' },
        } as never,
        undefined,
        {
          destinationWalletId: '550e8400-e29b-41d4-a716-446655440000',
          amount: '100.00',
        },
      ),
    ).toThrow('A valid Idempotency-Key header is required');

    expect(transfersService.transfer).not.toHaveBeenCalled();
  });
});
