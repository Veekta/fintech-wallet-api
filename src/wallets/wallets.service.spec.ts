import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { WalletsService } from './wallets.service.js';

const mocks = vi.hoisted(() => ({
  first: vi.fn(),
}));

vi.mock('../prisma/db.js', () => ({
  db: {
    orm: {
      public: {
        Wallet: {
          first: mocks.first,
        },
      },
    },
  },
}));

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WalletsService();
  });

  it('returns the wallet for the specified user', async () => {
    mocks.first.mockResolvedValue({
      id: 'wallet-123',
      userId: 'user-123',
      balance: { toString: () => '25000.00' },
      currency: 'NGN',
      status: 'ACTIVE',
    });

    await expect(service.findByUserId('user-123')).resolves.toEqual({
      id: 'wallet-123',
      currency: 'NGN',
      balance: '25000.00',
      status: 'ACTIVE',
    });

    expect(mocks.first).toHaveBeenCalledWith({
      userId: 'user-123',
    });
  });

  it('throws NotFoundException when the user has no wallet', async () => {
    mocks.first.mockResolvedValue(null);

    await expect(service.findByUserId('user-without-wallet')).rejects.toThrow(
      NotFoundException,
    );
  });
});
