import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { db } from '../prisma/db.js';

vi.mock('../prisma/db.js', () => ({
  db: {
    raw: {
      sql: vi.fn(),
    },
    runtime: vi.fn(),
    transaction: vi.fn(),
  },
}));

describe('AdminService', () => {
  let service: AdminService;
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new AdminService();

    queryMock = vi.fn();
    vi.mocked(db.runtime).mockReturnValue({
      query: queryMock,
    } as never);

    vi.mocked(db.raw.sql).mockImplementation((() => {
      const plan = {
        returnsRow: vi.fn().mockReturnThis(),
        build: vi.fn().mockReturnValue({}),
      };
      return plan;
    }) as never);

    vi.mocked(db.transaction).mockImplementation(async (callback) => {
      const tx = {
        query: queryMock,
      };

      return callback(tx as never);
    });
  });

  it('lists users with pagination metadata', async () => {
    queryMock.mockResolvedValueOnce([{ total: '21' }]).mockResolvedValueOnce([
      {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);

    const result = await service.getUsers({ page: 2, limit: 10 });

    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('passwordHash');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a user-list limit greater than 100', async () => {
    await expect(service.getUsers({ limit: 101 })).rejects.toThrow(
      BadRequestException,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid role filter', async () => {
    await expect(service.getUsers({ role: 'SUPERADMIN' })).rejects.toThrow(
      BadRequestException,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid user status filter', async () => {
    await expect(service.getUsers({ status: 'UNKNOWN' })).rejects.toThrow(
      BadRequestException,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns user details and wallet information', async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00.000Z',
        walletId: 'wallet-1',
        balance: '1500.00',
        currency: 'NGN',
        walletStatus: 'ACTIVE',
        walletCreatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);

    const result = await service.findUserById('user-1');

    expect(result.id).toBe('user-1');
    expect(result.wallet).toEqual({
      id: 'wallet-1',
      balance: '1500.00',
      currency: 'NGN',
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws NotFoundException when a user does not exist', async () => {
    queryMock.mockResolvedValueOnce([]);

    await expect(service.findUserById('missing-user')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating a missing user', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }]) // Advisory lock
      .mockResolvedValueOnce([]); // Target user not found

    await expect(
      service.updateUserStatus('missing-user', 'SUSPENDED', 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an invalid status when updating a user', async () => {
    await expect(
      service.updateUserStatus('user-1', 'UNKNOWN', 'admin-1'),
    ).rejects.toThrow(BadRequestException);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an administrator attempting to suspend their own account', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([
        { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE' },
      ]);

    await expect(
      service.updateUserStatus('admin-1', 'SUSPENDED', 'admin-1'),
    ).rejects.toThrow('You cannot suspend or deactivate your own account');
  });

  it('rejects an administrator attempting to deactivate their own account', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([
        { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE' },
      ]);

    await expect(
      service.updateUserStatus('admin-1', 'DEACTIVATED', 'admin-1'),
    ).rejects.toThrow('You cannot suspend or deactivate your own account');
  });

  it('rejects suspending the last active administrator', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([
        { id: 'admin-2', role: 'ADMIN', status: 'ACTIVE' },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);

    await expect(
      service.updateUserStatus('admin-2', 'SUSPENDED', 'admin-1'),
    ).rejects.toThrow(
      'Cannot suspend or deactivate the last active administrator',
    );
  });

  it('rejects deactivating the last active administrator', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([
        { id: 'admin-2', role: 'ADMIN', status: 'ACTIVE' },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);

    await expect(
      service.updateUserStatus('admin-2', 'DEACTIVATED', 'admin-1'),
    ).rejects.toThrow(
      'Cannot suspend or deactivate the last active administrator',
    );
  });

  it('allows suspending an administrator when another active administrator remains', async () => {
    queryMock
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([
        { id: 'admin-2', role: 'ADMIN', status: 'ACTIVE' },
      ])
      .mockResolvedValueOnce([{ total: '2' }])
      .mockResolvedValueOnce([
        {
          id: 'admin-2',
          email: 'admin2@example.com',
          name: 'Second Admin',
          role: 'ADMIN',
          status: 'SUSPENDED',
          updatedAt: '2026-10-29T12:00:00.000Z',
        },
      ]);

    const result = await service.updateUserStatus(
      'admin-2',
      'SUSPENDED',
      'admin-1',
    );

    expect(result).toMatchObject({
      id: 'admin-2',
      role: 'ADMIN',
      status: 'SUSPENDED',
    });
  });

  it('lists transactions with pagination metadata', async () => {
    queryMock.mockResolvedValueOnce([{ total: '5' }]).mockResolvedValueOnce([
      {
        id: 'transaction-1',
        initiatedByUserId: 'user-1',
        type: 'TRANSFER',
        status: 'COMPLETED',
        amount: '500.00',
        currency: 'NGN',
        sourceWalletId: 'wallet-1',
        destinationWalletId: 'wallet-2',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);

    const result = await service.getTransactions({
      page: 1,
      limit: 10,
      type: 'TRANSFER',
      status: 'COMPLETED',
    });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 5,
      totalPages: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid transaction type', async () => {
    await expect(service.getTransactions({ type: 'UNKNOWN' })).rejects.toThrow(
      BadRequestException,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid transaction status', async () => {
    await expect(
      service.getTransactions({ status: 'UNKNOWN' }),
    ).rejects.toThrow(BadRequestException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects a reversed date range', async () => {
    await expect(
      service.getTransactions({
        startDate: '2026-10-20',
        endDate: '2026-10-01',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
