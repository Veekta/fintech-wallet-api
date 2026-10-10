import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { isUniqueConstraintViolation } from '@prisma/orm-family-sql/errors';
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokensService } from './services/refresh-tokens.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);

    try {
      const user = await this.usersService.createWithWallet({
        email,
        passwordHash,
        name: dto.name.trim(),
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      };
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const refreshToken = await this.refreshTokensService.createForUser(user.id);

    return {
      accessToken,
      refreshToken: refreshToken.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    };
  }

  async refresh(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const rotated = await this.refreshTokensService.rotateToken(token);
    const user = rotated.user;

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: rotated.token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    };
  }

  async logout(token: string | undefined) {
    if (token) {
      await this.refreshTokensService.revokeToken(token);
    }

    return {
      message: 'Logged out successfully',
    };
  }
}
