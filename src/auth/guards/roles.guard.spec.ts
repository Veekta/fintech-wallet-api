import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: vi.fn(),
  };

  const guard = new RolesGuard(reflector as unknown as Reflector);

  function createContext(role?: string) {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { sub: 'user-123', role } : undefined,
        }),
      }),
    } as never;
  }

  it('allows an ADMIN when ADMIN is required', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(guard.canActivate(createContext('ADMIN'))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });

  it('rejects a USER when ADMIN is required', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(createContext('USER'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request without an authenticated user when ADMIN is required', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(createContext())).toThrow(
      ForbiddenException,
    );
  });

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext('USER'))).toBe(true);
  });
});
