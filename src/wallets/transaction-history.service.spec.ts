import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { TransactionHistoryService } from './transaction-history.service.js';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto.js';

interface HistoryFixture {
  userIds: string[];
  walletIds: string[];
}

const historyService = new TransactionHistoryService();

async function createHistoryFixture(): Promise<HistoryFixture> {
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const walletIds = [randomUUID(), randomUUID(), randomUUID()];

  await db.transaction(async (tx) => {
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]!;
      const walletId = walletIds[i]!;

      await tx.orm.public.User.create({
        id: userId,
        email: `history-${userId}@example.test`,
        passwordHash: 'integration-test-not-a-real-password-hash',
        name: 'Transaction History Test',
      });

      await tx.orm.public.Wallet.create({
        id: walletId,
        userId,
      });
    }
  });

  return { userIds, walletIds };
}

async function createHistoryTransaction(
  sourceWalletId: string,
  destinationWalletId: string,
  createdAt: string,
  options?: {
    type?: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL';
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
    amount?: string;
  },
): Promise<string> {
  const id = randomUUID();

  const plan = db.raw.sql`
    INSERT INTO "public"."Transaction" (
      "id",
      "initiatedByUserId",
      "type",
      "status",
      "amount",
      "currency",
      "sourceWalletId",
      "destinationWalletId",
      "createdAt",
      "updatedAt"
    )
    SELECT
      ${id},
      w."userId",
      ${options?.type ?? 'TRANSFER'},
      ${options?.status ?? 'COMPLETED'},
      ${options?.amount ?? '100.00'}::numeric,
      'NGN',
      ${sourceWalletId},
      ${destinationWalletId},
      ${createdAt}::timestamptz,
      ${createdAt}::timestamptz
    FROM "public"."Wallet" w
    WHERE w."id" = ${sourceWalletId}
  `
    .affectedCount()
    .build();

  await db.runtime().execute(plan);
  return id;
}

async function cleanupHistoryFixture(fixture: HistoryFixture): Promise<void> {
  if (fixture.walletIds.length === 0) {
    await db.transaction(async (tx) => {
      const deleteUsers = db.raw.sql`
        DELETE FROM "public"."User"
        WHERE "id" IN (
          ${fixture.userIds[0]!}
        )
      `
        .affectedCount()
        .build();

      await tx.execute(deleteUsers);
    });

    return;
  }

  await db.transaction(async (tx) => {
    const deleteLedger = db.raw.sql`
      DELETE FROM "public"."LedgerEntry"
      WHERE "walletId" IN (
        ${fixture.walletIds[0]!},
        ${fixture.walletIds[1]!},
        ${fixture.walletIds[2]!}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteLedger);

    const deleteTransactions = db.raw.sql`
      DELETE FROM "public"."Transaction"
      WHERE "sourceWalletId" IN (
        ${fixture.walletIds[0]!},
        ${fixture.walletIds[1]!},
        ${fixture.walletIds[2]!}
      )
      OR "destinationWalletId" IN (
        ${fixture.walletIds[0]!},
        ${fixture.walletIds[1]!},
        ${fixture.walletIds[2]!}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteTransactions);

    const deleteWallets = db.raw.sql`
      DELETE FROM "public"."Wallet"
      WHERE "id" IN (
        ${fixture.walletIds[0]!},
        ${fixture.walletIds[1]!},
        ${fixture.walletIds[2]!}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteWallets);

    const deleteUsers = db.raw.sql`
      DELETE FROM "public"."User"
      WHERE "id" IN (
        ${fixture.userIds[0]!},
        ${fixture.userIds[1]!},
        ${fixture.userIds[2]!}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteUsers);
  });
}

describe('TransactionHistoryService integration', () => {
  let fixture: HistoryFixture | undefined;

  afterEach(async () => {
    if (fixture) {
      await cleanupHistoryFixture(fixture);
      fixture = undefined;
    }
  });

  it('returns incoming and outgoing transactions but excludes unrelated transactions', async () => {
    fixture = await createHistoryFixture();

    const [userA, userB, userC] = fixture.userIds;
    const [walletA, walletB, walletC] = fixture.walletIds;

    if (!userA || !userB || !userC || !walletA || !walletB || !walletC) {
      throw new Error('History fixture is incomplete');
    }

    // A sends money to B.
    const outgoingId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-20T10:00:00.000Z',
    );

    // C sends money to A.
    const incomingId = await createHistoryTransaction(
      walletC,
      walletA,
      '2026-10-21T10:00:00.000Z',
    );

    // B sends money to C. A must not see this transaction.
    await createHistoryTransaction(
      walletB,
      walletC,
      '2026-10-22T10:00:00.000Z',
    );

    const result = await historyService.findByUserId(userA, {
      page: 1,
      limit: 20,
    } as TransactionHistoryQueryDto);

    expect(result.data).toHaveLength(2);

    // Newest transaction first.
    expect(result.data.map((transaction) => transaction.id)).toEqual([
      incomingId,
      outgoingId,
    ]);

    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('filters transactions by an inclusive UTC date range', async () => {
    fixture = await createHistoryFixture();

    const [userA, userB, userC] = fixture.userIds;
    const [walletA, walletB, walletC] = fixture.walletIds;

    if (!userA || !userB || !userC || !walletA || !walletB || !walletC) {
      throw new Error('History fixture is incomplete');
    }

    // One transaction before the requested range.
    await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-19T23:59:59.999Z',
    );

    // Start date: must be included.
    const startDateId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-20T00:00:00.000Z',
    );

    // End date: must be included.
    const endDateId = await createHistoryTransaction(
      walletB,
      walletA,
      '2026-10-21T23:59:59.999Z',
    );

    // One transaction after the requested range.
    await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-22T00:00:00.000Z',
    );

    const result = await historyService.findByUserId(userA, {
      startDate: '2026-10-20',
      endDate: '2026-10-21',
      page: 1,
      limit: 20,
    } as TransactionHistoryQueryDto);

    expect(result.data).toHaveLength(2);

    expect(result.data.map((transaction) => transaction.id)).toEqual([
      endDateId,
      startDateId,
    ]);

    expect(result.pagination.total).toBe(2);
  });

  it('filters transactions by type and status together', async () => {
    fixture = await createHistoryFixture();

    const [userA] = fixture.userIds;
    const [walletA, walletB] = fixture.walletIds;

    if (!userA || !walletA || !walletB) {
      throw new Error('History fixture is incomplete');
    }

    // Matches both filters.
    const matchingId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-20T10:00:00.000Z',
      {
        type: 'TRANSFER',
        status: 'COMPLETED',
      },
    );

    // Correct type, but wrong status.
    await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-21T10:00:00.000Z',
      {
        type: 'TRANSFER',
        status: 'FAILED',
      },
    );

    // Correct status, but wrong type.
    await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-22T10:00:00.000Z',
      {
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
      },
    );

    const result = await historyService.findByUserId(userA, {
      type: 'TRANSFER',
      status: 'COMPLETED',
      page: 1,
      limit: 20,
    } as TransactionHistoryQueryDto);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(matchingId);
    expect(result.data[0]?.type).toBe('TRANSFER');
    expect(result.data[0]?.status).toBe('COMPLETED');

    expect(result.pagination.total).toBe(1);
  });

  it('paginates transactions and preserves the total count', async () => {
    fixture = await createHistoryFixture();

    const [userA] = fixture.userIds;
    const [walletA, walletB] = fixture.walletIds;

    if (!userA || !walletA || !walletB) {
      throw new Error('History fixture is incomplete');
    }

    const olderId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-20T10:00:00.000Z',
    );

    const middleId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-21T10:00:00.000Z',
    );

    const newestId = await createHistoryTransaction(
      walletA,
      walletB,
      '2026-10-22T10:00:00.000Z',
    );

    const firstPage = await historyService.findByUserId(userA, {
      page: 1,
      limit: 2,
    } as TransactionHistoryQueryDto);

    expect(firstPage.data.map((transaction) => transaction.id)).toEqual([
      newestId,
      middleId,
    ]);

    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const secondPage = await historyService.findByUserId(userA, {
      page: 2,
      limit: 2,
    } as TransactionHistoryQueryDto);

    expect(secondPage.data.map((transaction) => transaction.id)).toEqual([
      olderId,
    ]);

    expect(secondPage.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('rejects a date range where startDate is later than endDate', async () => {
    fixture = await createHistoryFixture();

    const [userA] = fixture.userIds;

    if (!userA) {
      throw new Error('History fixture is incomplete');
    }

    await expect(
      historyService.findByUserId(userA, {
        startDate: '2026-10-22',
        endDate: '2026-10-20',
        page: 1,
        limit: 20,
      } as TransactionHistoryQueryDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the user has no wallet', async () => {
    const userId = randomUUID();

    await db.orm.public.User.create({
      id: userId,
      email: `history-no-wallet-${userId}@example.test`,
      passwordHash: 'integration-test-not-a-real-password-hash',
      name: 'Transaction History Test',
    });

    // Track this user for cleanup without creating a wallet.
    fixture = {
      userIds: [userId],
      walletIds: [],
    };

    await expect(
      historyService.findByUserId(userId, {
        page: 1,
        limit: 20,
      } as TransactionHistoryQueryDto),
    ).rejects.toThrow(NotFoundException);
  });
});
