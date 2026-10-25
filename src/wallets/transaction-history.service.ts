import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto.js';

export interface TransactionHistoryRow {
  id: string;
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  amount: string;
  currency: string;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  createdAt: string;
}

interface CountRow {
  total: string;
}

@Injectable()
export class TransactionHistoryService {
  async findByUserId(userId: string, filters: TransactionHistoryQueryDto) {
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      throw new BadRequestException('startDate must not be later than endDate');
    }

    const walletPlan = db.raw.sql`
      SELECT "id"
      FROM "public"."Wallet"
      WHERE "userId" = ${userId}
      LIMIT 1
    `
      .returnsRow({ id: 'pg/text@1' })
      .build();

    const walletRows = await db.runtime().query(walletPlan);
    const wallet = walletRows[0];

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const hasStartDate = Boolean(filters.startDate);
    const start = filters.startDate
      ? `${filters.startDate}T00:00:00.000Z`
      : '1970-01-01T00:00:00.000Z';

    const hasEndDate = Boolean(filters.endDate);
    const endExclusive = filters.endDate
      ? new Date(`${filters.endDate}T00:00:00.000Z`).getTime() +
        24 * 60 * 60 * 1000
      : 0;

    const hasType = Boolean(filters.type);
    const type = filters.type ?? 'TRANSFER';

    const hasStatus = Boolean(filters.status);
    const status = filters.status ?? 'COMPLETED';

    const offset = (filters.page - 1) * filters.limit;

    const countPlan = db.raw.sql`
      SELECT COUNT(*)::text AS "total"
      FROM "public"."Transaction" t
      WHERE (
        t."sourceWalletId" = ${wallet.id}
        OR t."destinationWalletId" = ${wallet.id}
      )
      AND (
        ${hasStartDate} = false
        OR t."createdAt" >= ${start}::timestamptz
      )
      AND (
        ${hasEndDate} = false
        OR t."createdAt" < to_timestamp(
          ${endExclusive}::double precision / 1000
        )
      )
      AND (${hasType} = false OR t."type" = ${type})
      AND (${hasStatus} = false OR t."status" = ${status})
    `
      .returnsRow({ total: 'pg/text@1' })
      .build();

    const countRows = await db.runtime().query(countPlan);
    const countRow = countRows[0] as CountRow | undefined;
    const total = Number(countRow?.total ?? '0');

    const dataPlan = db.raw.sql`
      SELECT
        t."id",
        t."type",
        t."status",
        t."amount"::text AS "amount",
        t."currency",
        t."sourceWalletId",
        t."destinationWalletId",
        t."createdAt"::text AS "createdAt"
      FROM "public"."Transaction" t
      WHERE (
        t."sourceWalletId" = ${wallet.id}
        OR t."destinationWalletId" = ${wallet.id}
      )
      AND (
        ${hasStartDate} = false
        OR t."createdAt" >= ${start}::timestamptz
      )
      AND (
        ${hasEndDate} = false
        OR t."createdAt" < to_timestamp(
          ${endExclusive}::double precision / 1000
        )
      )
      AND (${hasType} = false OR t."type" = ${type})
      AND (${hasStatus} = false OR t."status" = ${status})
      ORDER BY t."createdAt" DESC, t."id" DESC
      LIMIT ${filters.limit}
      OFFSET ${offset}
    `
      .returnsRow({
        id: 'pg/text@1',
        type: 'pg/text@1',
        status: 'pg/text@1',
        amount: 'pg/text@1',
        currency: 'pg/text@1',
        sourceWalletId: 'pg/text@1',
        destinationWalletId: 'pg/text@1',
        createdAt: 'pg/text@1',
      })
      .build();

    const rows = await db.runtime().query(dataPlan);

    return {
      data: rows as TransactionHistoryRow[],
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }
}
