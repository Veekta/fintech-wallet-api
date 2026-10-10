import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const jwtServiceMock = {
    verifyAsync: vi.fn(),
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
  });

  it('should reject an invalid or expired token', async () => {
    jwtServiceMock.verifyAsync.mockRejectedValue(new Error('Invalid token'));

    const { context } = createExecutionContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should allow a valid token and attach claims to the request', async () => {
    const payload = {
      sub: 'user-123',
      role: 'USER',
      iat: 1791617491,
      exp: 1791618391,
    };

    jwtServiceMock.verifyAsync.mockResolvedValue(payload);

    const { context, request } = createExecutionContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('valid-token');

    expect(request.user).toEqual(payload);
  });
});
