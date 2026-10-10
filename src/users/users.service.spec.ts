import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { db } from '../prisma/db.js';

vi.mock('../prisma/db.js', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

describe('UsersService', () => {
  let service: UsersService;

  const userCreateMock = vi.fn();
  const walletCreateMock = vi.fn();

  const transactionMock = vi.mocked(db.transaction);

  beforeEach(() => {
    vi.resetAllMocks();

    transactionMock.mockImplementation(async (callback: any) => {
      return callback({
        orm: {
          public: {
            User: {
              create: userCreateMock,
            },
            Wallet: {
              create: walletCreateMock,
            },
          },
        },
      } as never);
    });

    service = new UsersService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user and wallet in one transaction', async () => {
    userCreateMock.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    walletCreateMock.mockResolvedValue({
      id: 'wallet-123',
      userId: 'user-123',
      balance: '0',
      currency: 'NGN',
      status: 'ACTIVE',
    });

    const result = await service.createWithWallet({
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
    });

    expect(transactionMock).toHaveBeenCalledOnce();

    expect(userCreateMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
    });

    expect(walletCreateMock).toHaveBeenCalledWith({
      userId: 'user-123',
    });

    expect(result.id).toBe('user-123');
    expect(result.email).toBe('user@example.com');
  });

  it('should reject if wallet creation fails', async () => {
    userCreateMock.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const walletError = new Error('Wallet creation failed');
    walletCreateMock.mockRejectedValue(walletError);

    await expect(
      service.createWithWallet({
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        name: 'Test User',
      }),
    ).rejects.toThrow('Wallet creation failed');

    expect(transactionMock).toHaveBeenCalledOnce();
  });
});
