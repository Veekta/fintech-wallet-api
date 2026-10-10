import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { db } from '../../prisma/db.js';
import { RefreshTokensService } from './refresh-tokens.service.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  first: vi.fn(),
  userFirst: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  build: vi.fn(),
}));

vi.mock('../../prisma/db.js', () => ({
  db: {
    orm: {
      public: {
        RefreshToken: {
          create: mocks.create,
          first: mocks.first,
        },
      },
    },
    sql: {
      public: {
        RefreshToken: {
          update: mocks.update,
        },
      },
    },
    transaction: mocks.transaction,
    query: mocks.query,
  },
}));

describe('RefreshTokensService', () => {
  let service: RefreshTokensService;

  const refreshTokenModel = db.orm.public.RefreshToken;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.update.mockReturnValue({
      where: mocks.where,
    });
    mocks.where.mockReturnValue({
      where: mocks.where,
      returning: mocks.returning,
    });
    mocks.returning.mockReturnValue({
      build: mocks.build,
    });
    mocks.build.mockReturnValue({ operation: 'conditional-revoke' });

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          orm: {
            public: {
              RefreshToken: {
                create: mocks.create,
                first: mocks.first,
              },
              User: {
                first: mocks.userFirst,
              },
            },
          },
          query: mocks.query,
        }),
    );

    service = new RefreshTokensService();
  });

  describe('createForUser', () => {
    it('stores the SHA-256 hash instead of the raw token', async () => {
      mocks.create.mockResolvedValue({});

      const result = await service.createForUser('user-123');

      const expectedHash = createHash('sha256')
        .update(result.token)
        .digest('hex');

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tokenHash: expectedHash,
        }),
      );

      expect(mocks.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: result.token }),
      );
    });
  });

  describe('rotateToken', () => {
    const token = 'existing-refresh-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');

    beforeEach(() => {
      mocks.first.mockResolvedValue({
        id: 'refresh-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        revokedAt: null,
      });

      mocks.userFirst.mockResolvedValue({
        id: 'user-123',
        status: 'ACTIVE',
      });

      mocks.query.mockResolvedValue([
        { id: 'refresh-123', userId: 'user-123' },
      ]);

      mocks.create.mockResolvedValue({});
    });

    it('revokes the old token and creates a replacement', async () => {
      const result = await service.rotateToken(token);

      expect(result.userId).toBe('user-123');
      expect(result.token).toBeTruthy();
      expect(result.token).not.toBe(token);

      expect(mocks.query).toHaveBeenCalledWith({
        operation: 'conditional-revoke',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tokenHash: createHash('sha256').update(result.token).digest('hex'),
        }),
      );
    });

    it('rejects a missing token', async () => {
      mocks.first.mockResolvedValue(null);

      await expect(service.rotateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      mocks.first.mockResolvedValue({
        id: 'refresh-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        revokedAt: null,
      });

      await expect(service.rotateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('rejects a revoked token', async () => {
      mocks.first.mockResolvedValue({
        id: 'refresh-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        revokedAt: new Date().toISOString(),
      });

      await expect(service.rotateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('rejects a user who is not active', async () => {
      mocks.userFirst.mockResolvedValue({
        id: 'user-123',
        status: 'SUSPENDED',
      });

      await expect(service.rotateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('rejects if another request has already revoked the token', async () => {
      mocks.query.mockResolvedValue([]);

      await expect(service.rotateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeToken', () => {
    it('hashes the token and revokes the matching active token', async () => {
      mocks.query.mockResolvedValue([{ id: 'refresh-123' }]);

      await service.revokeToken('my-refresh-token');

      const expectedHash = createHash('sha256')
        .update('my-refresh-token')
        .digest('hex');

      expect(mocks.query).toHaveBeenCalledWith({
        operation: 'conditional-revoke',
      });

      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          revokedAt: expect.any(String),
        }),
      );
    });

    it('does not fail when the token does not match a stored token', async () => {
      mocks.query.mockResolvedValue([]);

      await expect(
        service.revokeToken('unknown-refresh-token'),
      ).resolves.toBeUndefined();
    });
  });
});
