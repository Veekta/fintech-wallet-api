import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { UsersService } from '../../users/users.service.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const jwtServiceMock = {
    verifyAsync: vi.fn(),
  };

  const usersServiceMock = {
    findById: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  function createExecutionContext(authorization?: string) {
    const request: {
      headers: { authorization?: string };
      user?: {
        sub: string;
        role: string;
        iat?: number;
        exp?: number;
      };
    } = {
      headers: {},
    };

    if (authorization) {
      request.headers.authorization = authorization;
    }

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should reject a request without an access token', async () => {
    const { context } = createExecutionContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(jwtServiceMock.verifyAsync).not.toHaveBeenCalled();
    expect(usersServiceMock.findById).not.toHaveBeenCalled();
  });

  it('should reject an invalid or expired token', async () => {
    jwtServiceMock.verifyAsync.mockRejectedValue(new Error('Invalid token'));

    const { context } = createExecutionContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(usersServiceMock.findById).not.toHaveBeenCalled();
  });

  it('should allow an active user and attach the current database role', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'user-123',
      role: 'USER',
      iat: 1791617491,
      exp: 1791618391,
    });

    usersServiceMock.findById.mockResolvedValue({
      id: 'user-123',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const { context, request } = createExecutionContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('valid-token');
    expect(usersServiceMock.findById).toHaveBeenCalledWith('user-123');
    expect(request.user).toEqual({
      sub: 'user-123',
      role: 'ADMIN',
      iat: 1791617491,
      exp: 1791618391,
    });
  });

  it.each(['SUSPENDED', 'DEACTIVATED'])(
    'should reject a user with status %s',
    async (status) => {
      jwtServiceMock.verifyAsync.mockResolvedValue({
        sub: 'user-123',
        role: 'USER',
      });

      usersServiceMock.findById.mockResolvedValue({
        id: 'user-123',
        role: 'USER',
        status,
      });

      const { context } = createExecutionContext('Bearer valid-token');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('should reject a token belonging to a user who no longer exists', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'user-123',
      role: 'USER',
    });

    usersServiceMock.findById.mockResolvedValue(null);

    const { context } = createExecutionContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should reject the request if the user lookup fails', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'user-123',
      role: 'USER',
    });

    usersServiceMock.findById.mockRejectedValue(new Error('Database error'));

    const { context } = createExecutionContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
