import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service.js';

interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(/\s+/, 2) ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
        throw new UnauthorizedException('Invalid access token');
      }

      const user = await this.usersService.findById(payload.sub);

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('User account is unavailable');
      }

      request.user = {
        ...payload,
        role: user.role,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
