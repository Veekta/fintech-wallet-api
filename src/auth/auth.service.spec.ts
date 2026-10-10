import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokensService } from './services/refresh-tokens.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const usersServiceMock = {
    findByEmail: vi.fn(),
    createWithWallet: vi.fn(),
  };

  const jwtServiceMock = {
    signAsync: vi.fn().mockResolvedValue('test-access-token'),
  };

  const refreshTokensServiceMock = {
    createForUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    refreshTokensServiceMock.createForUser.mockResolvedValue({
      token: 'test-refresh-token',
      expiresAt: '2026-10-17T14:00:00.000Z',
    });

    jwtServiceMock.signAsync.mockResolvedValue('test-access-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },

        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: RefreshTokensService,
          useValue: refreshTokensServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register a user and return safe user data', async () => {
    usersServiceMock.findByEmail.mockResolvedValue(null);

    usersServiceMock.createWithWallet.mockImplementation(async (input) => ({
      id: 'user-123',
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const result = await service.register({
      email: '  USER@example.com ',
      password: 'Password123!',
      name: ' Test User ',
    });

    expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );

    expect(usersServiceMock.createWithWallet).toHaveBeenCalledOnce();

    const createInput = usersServiceMock.createWithWallet.mock.calls[0][0];

    expect(createInput.email).toBe('user@example.com');
    expect(createInput.name).toBe('Test User');
    expect(createInput.passwordHash).not.toBe('Password123!');

    expect(await argon2.verify(createInput.passwordHash, 'Password123!')).toBe(
      true,
    );

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      role: 'USER',
      status: 'ACTIVE',
    });
  });

  it('should reject an already registered email', async () => {
    usersServiceMock.findByEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'user@example.com',
    });

    await expect(
      service.register({
        email: 'user@example.com',
        password: 'Password123!',
        name: 'Test User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(usersServiceMock.createWithWallet).not.toHaveBeenCalled();
  });

  it('should return 409 when the database rejects a duplicate email', async () => {
    usersServiceMock.findByEmail.mockResolvedValue(null);

    usersServiceMock.createWithWallet.mockRejectedValue({
      kind: 'sql_query',
      sqlState: '23505',
    });

    await expect(
      service.register({
        email: 'user@example.com',
        password: 'Password123!',
        name: 'Test User',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        message: 'Email is already registered',
      },
    });

    expect(usersServiceMock.createWithWallet).toHaveBeenCalledOnce();
  });

  it('should log in a user with valid credentials and return safe data', async () => {
    const passwordHash = await argon2.hash('Password123!');

    usersServiceMock.findByEmail.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      passwordHash,
      name: 'Test User',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.login({
      email: ' USER@example.com ',
      password: 'Password123!',
    });

    expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );

    expect(result).toMatchObject({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    expect(refreshTokensServiceMock.createForUser).toHaveBeenCalledOnce();

    expect(refreshTokensServiceMock.createForUser).toHaveBeenCalledWith(
      'user-123',
    );

    expect(result.user).not.toHaveProperty('passwordHash');

    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
      sub: 'user-123',
      role: 'USER',
    });
  });

  it('should reject an incorrect password', async () => {
    const passwordHash = await argon2.hash('CorrectPassword123!');

    usersServiceMock.findByEmail.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      passwordHash,
      name: 'Test User',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(refreshTokensServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('should reject an unknown email', async () => {
    usersServiceMock.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'Password123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(refreshTokensServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('should reject an inactive account', async () => {
    const passwordHash = await argon2.hash('Password123!');

    usersServiceMock.findByEmail.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      passwordHash,
      name: 'Test User',
      role: 'USER',
      status: 'SUSPENDED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'Password123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(refreshTokensServiceMock.createForUser).not.toHaveBeenCalled();
  });
});
