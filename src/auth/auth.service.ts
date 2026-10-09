import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { isUniqueConstraintViolation } from '@prisma/orm-family-sql/errors';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

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
}
