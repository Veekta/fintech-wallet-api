import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../prisma/db.js';

@Injectable()
export class WalletsService {
  async findByUserId(userId: string) {
    const wallet = await db.orm.public.Wallet.first({
      userId,
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      status: wallet.status,
    };
  }
}
