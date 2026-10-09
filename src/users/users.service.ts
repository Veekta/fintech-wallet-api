import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db.js';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
}

@Injectable()
export class UsersService {
  async findByEmail(email: string) {
    return db.orm.public.User.first({ email });
  }

  async createWithWallet(input: CreateUserInput) {
    return db.transaction(async (tx) => {
      const user = await tx.orm.public.User.create({
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
      });

      await tx.orm.public.Wallet.create({
        userId: user.id,
      });

      return user;
    });
  }
}
