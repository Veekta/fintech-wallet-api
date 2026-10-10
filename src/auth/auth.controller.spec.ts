import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };

  const createResponseMock = () =>
    ({
      clearCookie: vi.fn(),
    }) as unknown as Response;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: vi.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const refreshToken = 'test-refresh-token';
      const request = {
        cookies: { refresh_token: refreshToken },
      } as unknown as Request;
      const response = createResponseMock();

      authServiceMock.logout.mockResolvedValue({
        message: 'Logged out successfully',
      });

      const result = await controller.logout(request, response);

      expect(authServiceMock.logout).toHaveBeenCalledWith(refreshToken);
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
      });
      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });

    it('clears the cookie when no refresh token is present', async () => {
      const request = {
        cookies: {},
      } as unknown as Request;
      const response = createResponseMock();

      authServiceMock.logout.mockResolvedValue({
        message: 'Logged out successfully',
      });

      const result = await controller.logout(request, response);

      expect(authServiceMock.logout).toHaveBeenCalledWith(undefined);
      expect(response.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/api/v1/auth',
        }),
      );
      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });

    it('does not clear the cookie when revocation fails', async () => {
      const request = {
        cookies: { refresh_token: 'test-refresh-token' },
      } as unknown as Request;
      const response = createResponseMock();

      authServiceMock.logout.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(controller.logout(request, response)).rejects.toThrow(
        'Database unavailable',
      );

      expect(response.clearCookie).not.toHaveBeenCalled();
    });
  });
});
