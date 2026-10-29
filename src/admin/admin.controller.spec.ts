import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: {
    getUsers: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    updateUserStatus: ReturnType<typeof vi.fn>;
    getTransactions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adminService = {
      getUsers: vi.fn(),
      findUserById: vi.fn(),
      updateUserStatus: vi.fn(),
      getTransactions: vi.fn(),
    };

    controller = new AdminController(adminService as unknown as AdminService);
  });

  it('forwards user-list filters and pagination', async () => {
    const expected = {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    adminService.getUsers.mockResolvedValue(expected);

    const result = await controller.getUsers(
      '1',
      '20',
      'victor',
      'USER',
      'ACTIVE',
    );

    expect(adminService.getUsers).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: 'victor',
      role: 'USER',
      status: 'ACTIVE',
    });
    expect(result).toEqual(expected);
  });

  it('forwards user ID when retrieving user details', async () => {
    const expected = { id: 'user-1', email: 'user@example.com', wallet: null };
    adminService.findUserById.mockResolvedValue(expected);

    const result = await controller.getUserById('user-1');

    expect(adminService.findUserById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(expected);
  });

  it('forwards account status updates', async () => {
    const expected = { id: 'user-1', status: 'SUSPENDED' };
    adminService.updateUserStatus.mockResolvedValue(expected);

    const request = {
      user: {
        sub: 'admin-1',
        role: 'ADMIN',
      },
    };

    const result = await controller.updateUserStatus(
      'user-1',
      'SUSPENDED',
      request as never,
    );

    expect(adminService.updateUserStatus).toHaveBeenCalledWith(
      'user-1',
      'SUSPENDED',
      'admin-1',
    );
    expect(result).toEqual(expected);
  });

  it('forwards transaction filters and pagination', async () => {
    const expected = {
      data: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    };
    adminService.getTransactions.mockResolvedValue(expected);

    const result = await controller.getTransactions(
      '2',
      '10',
      'TRANSFER',
      'COMPLETED',
      '2026-10-01',
      '2026-10-29',
    );

    expect(adminService.getTransactions).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      type: 'TRANSFER',
      status: 'COMPLETED',
      startDate: '2026-10-01',
      endDate: '2026-10-29',
    });
    expect(result).toEqual(expected);
  });
});
