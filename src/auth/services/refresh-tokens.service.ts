import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '../../prisma/db.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokensService {
  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createForUser(userId: string) {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    await db.orm.public.RefreshToken.create({
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      token,
      expiresAt,
    };
  }

  async findByToken(token: string) {
    const tokenHash = this.hashToken(token);

    return db.orm.public.RefreshToken.first({
      tokenHash,
    });
  }

  async rotateToken(token: string) {
    const tokenHash = this.hashToken(token);

    return db.transaction(async (tx) => {
      const existing = await tx.orm.public.RefreshToken.first({
        tokenHash,
      });

      if (
        !existing ||
        existing.revokedAt !== null ||
        new Date(existing.expiresAt).getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const user = await tx.orm.public.User.first({
        id: existing.userId,
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const now = new Date().toISOString();

      const revokedRows = await tx.query(
        db.sql.public.RefreshToken.update({ revokedAt: now })
          .where((fields, fns) => fns.eq(fields.id, existing.id))
          .where((fields, fns) => fns.eq(fields.revokedAt, null))
          .where((fields, fns) => fns.gt(fields.expiresAt, now))
          .returning('id', 'userId')
          .build(),
      );

      if (revokedRows.length !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const replacement = this.generateToken();
      const replacementHash = this.hashToken(replacement);
      const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_MS,
      ).toISOString();

      await tx.orm.public.RefreshToken.create({
        userId: existing.userId,
        tokenHash: replacementHash,
        expiresAt,
      });

      return {
        userId: existing.userId,
        token: replacement,
        expiresAt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
        },
      };
    });
  }
}
