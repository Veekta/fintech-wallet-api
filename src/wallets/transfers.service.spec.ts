import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../prisma/db.js';
import { TransfersService } from './transfers.service.js';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

interface TestWalletFixture {
  senderUserId: string;
  senderWalletId: string;
  recipientUserId: string;
  recipientWalletId: string;
}

/**
 * Creates disposable users and wallets for integration tests.
 * The starting balances are set explicitly so each test is predictable.
 */
async function createTestWalletFixture(): Promise<TestWalletFixture> {
  const senderUserId = randomUUID();
  const recipientUserId = randomUUID();
  const senderWalletId = randomUUID();
  const recipientWalletId = randomUUID();

  const senderEmail = `transfer-sender-${senderUserId}@example.test`;
  const recipientEmail = `transfer-recipient-${recipientUserId}@example.test`;

  await db.transaction(async (tx) => {
    await tx.orm.public.User.create({
      id: senderUserId,
      email: senderEmail,
      passwordHash: 'integration-test-not-a-real-password-hash',
      name: 'Transfer Test Sender',
    });

    await tx.orm.public.User.create({
      id: recipientUserId,
      email: recipientEmail,
      passwordHash: 'integration-test-not-a-real-password-hash',
      name: 'Transfer Test Recipient',
    });

    await tx.orm.public.Wallet.create({
      id: senderWalletId,
      userId: senderUserId,
    });

    await tx.orm.public.Wallet.create({
      id: recipientWalletId,
      userId: recipientUserId,
    });
  });

  // Set both starting balances within a transaction.
  // PostgreSQL stores these values as exact numeric amounts.
  await db.transaction(async (tx) => {
    const setBalancePlan = db.raw.sql`
      UPDATE "public"."Wallet"
      SET "balance" = CASE
        WHEN "id" = ${senderWalletId} THEN 500.00
        WHEN "id" = ${recipientWalletId} THEN 100.00
      END
      WHERE "id" IN (${senderWalletId}, ${recipientWalletId})
    `
      .affectedCount()
      .build();

    await tx.execute(setBalancePlan);
  });

  return {
    senderUserId,
    senderWalletId,
    recipientUserId,
    recipientWalletId,
  };
}

/**
 * Removes the disposable records created by a transfer integration test.
 *
 * Dependent ledger entries are deleted before their transactions.
 * Transactions are deleted before wallets and users.
 * All cleanup operations run in one database transaction.
 */
async function cleanupTestWalletFixture(
  fixture: TestWalletFixture,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Delete ledger entries belonging to transactions associated with
    // either test user or either test wallet.
    const deleteLedgerPlan = db.raw.sql`
      DELETE FROM "public"."LedgerEntry"
      WHERE "transactionId" IN (
        SELECT "id"
        FROM "public"."Transaction"
        WHERE "initiatedByUserId" IN (
          ${fixture.senderUserId},
          ${fixture.recipientUserId}
        )
        OR "sourceWalletId" IN (
          ${fixture.senderWalletId},
          ${fixture.recipientWalletId}
        )
        OR "destinationWalletId" IN (
          ${fixture.senderWalletId},
          ${fixture.recipientWalletId}
        )
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteLedgerPlan);

    // Delete the associated transactions after their ledger entries.
    const deleteTransactionsPlan = db.raw.sql`
      DELETE FROM "public"."Transaction"
      WHERE "initiatedByUserId" IN (
        ${fixture.senderUserId},
        ${fixture.recipientUserId}
      )
      OR "sourceWalletId" IN (
        ${fixture.senderWalletId},
        ${fixture.recipientWalletId}
      )
      OR "destinationWalletId" IN (
        ${fixture.senderWalletId},
        ${fixture.recipientWalletId}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteTransactionsPlan);

    // Wallets reference users, so remove wallets first.
    const deleteWalletsPlan = db.raw.sql`
      DELETE FROM "public"."Wallet"
      WHERE "id" IN (
        ${fixture.senderWalletId},
        ${fixture.recipientWalletId}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteWalletsPlan);

    // Finally, remove the disposable users.
    const deleteUsersPlan = db.raw.sql`
      DELETE FROM "public"."User"
      WHERE "id" IN (
        ${fixture.senderUserId},
        ${fixture.recipientUserId}
      )
    `
      .affectedCount()
      .build();

    await tx.execute(deleteUsersPlan);
  });
}

describe('PostgreSQL row locking', () => {
  it('holds a FOR UPDATE lock until the transaction completes', async () => {
    const wallets = await db.orm.public.Wallet.all();
    const wallet = wallets[0];

    expect(wallet).toBeDefined();

    if (!wallet) {
      throw new Error('Test requires an existing wallet');
    }

    let releaseFirstTransaction!: () => void;
    let firstTransactionHasLock!: () => void;

    const lockAcquired = new Promise<void>((resolve) => {
      firstTransactionHasLock = resolve;
    });

    const holdTransaction = new Promise<void>((resolve) => {
      releaseFirstTransaction = resolve;
    });

    const firstTransaction = db.transaction(async (tx) => {
      const plan = db.raw.sql`
        SELECT "id"
        FROM "public"."Wallet"
        WHERE "id" = ${wallet.id}
        FOR UPDATE
      `
        .returnsRow({ id: 'pg/text@1' })
        .build();

      await tx.query(plan);
      firstTransactionHasLock();

      await holdTransaction;
    });

    try {
      await lockAcquired;

      let secondTransactionFinished = false;

      const secondTransaction = db.transaction(async (tx) => {
        const plan = db.raw.sql`
          SELECT "id"
          FROM "public"."Wallet"
          WHERE "id" = ${wallet.id}
          FOR UPDATE
        `
          .returnsRow({ id: 'pg/text@1' })
          .build();

        await tx.query(plan);
        secondTransactionFinished = true;
      });

      // Give PostgreSQL a brief opportunity to process transaction B.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(secondTransactionFinished).toBe(false);

      releaseFirstTransaction();

      await Promise.all([firstTransaction, secondTransaction]);

      expect(secondTransactionFinished).toBe(true);
    } finally {
      releaseFirstTransaction?.();
    }
  });
});

describe('TransfersService integration', () => {
  const transfersService = new TransfersService();

  it('transfers funds and records matching transaction and ledger entries', async () => {
    const fixture = await createTestWalletFixture();

    try {
      const result = await transfersService.transfer(
        fixture.senderUserId,
        {
          destinationWalletId: fixture.recipientWalletId,
          amount: '100.00',
        },
        `transfer-test-${randomUUID()}`,
      );

      // Verify the API result.
      expect(result).toMatchObject({
        type: 'TRANSFER',
        status: 'COMPLETED',
        amount: '100.00',
        currency: 'NGN',
        sourceWalletId: fixture.senderWalletId,
        destinationWalletId: fixture.recipientWalletId,
      });

      // Verify both balances directly in PostgreSQL.
      const balancesPlan = db.raw.sql`
        SELECT "id", "balance"
        FROM "public"."Wallet"
        WHERE "id" IN (
          ${fixture.senderWalletId},
          ${fixture.recipientWalletId}
        )
      `
        .returnsRow({
          id: 'pg/text@1',
          balance: 'pg/numeric@1',
        })
        .build();

      const balances = await db.runtime().query(balancesPlan);

      const senderBalance = balances.find(
        (wallet) => wallet.id === fixture.senderWalletId,
      );
      const recipientBalance = balances.find(
        (wallet) => wallet.id === fixture.recipientWalletId,
      );

      expect(String(senderBalance?.balance)).toBe('400.00');
      expect(String(recipientBalance?.balance)).toBe('200.00');

      // Verify the transaction and its two ledger entries.
      const ledgerPlan = db.raw.sql`
        SELECT "entryType", "walletId", "amount"
        FROM "public"."LedgerEntry"
        WHERE "transactionId" = ${result.id}
        ORDER BY "entryType"
      `
        .returnsRow({
          entryType: 'pg/text@1',
          walletId: 'pg/text@1',
          amount: 'pg/numeric@1',
        })
        .build();

      const ledgerEntries = await db.runtime().query(ledgerPlan);

      expect(ledgerEntries).toHaveLength(2);
      expect(ledgerEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entryType: 'CREDIT',
            walletId: fixture.recipientWalletId,
            amount: '100.00',
          }),
          expect.objectContaining({
            entryType: 'DEBIT',
            walletId: fixture.senderWalletId,
            amount: '100.00',
          }),
        ]),
      );
    } finally {
      await cleanupTestWalletFixture(fixture);
    }
  });

  it('returns the original transaction when the same request is retried', async () => {
    const fixture = await createTestWalletFixture();
    const idempotencyKey = `transfer-retry-${randomUUID()}`;

    try {
      // Execute the original transfer.
      const firstResult = await transfersService.transfer(
        fixture.senderUserId,
        {
          destinationWalletId: fixture.recipientWalletId,
          amount: '100.00',
        },
        idempotencyKey,
      );

      // Retry the exact same request with the same idempotency key.
      const retryResult = await transfersService.transfer(
        fixture.senderUserId,
        {
          destinationWalletId: fixture.recipientWalletId,
          amount: '100.00',
        },
        idempotencyKey,
      );

      // The retry must return the original transaction.
      expect(retryResult).toEqual(firstResult);

      // The balances must reflect only one transfer.
      const balancesPlan = db.raw.sql`
        SELECT "id", "balance"
        FROM "public"."Wallet"
        WHERE "id" IN (
          ${fixture.senderWalletId},
          ${fixture.recipientWalletId}
        )
      `
        .returnsRow({
          id: 'pg/text@1',
          balance: 'pg/numeric@1',
        })
        .build();

      const balances = await db.runtime().query(balancesPlan);

      const senderBalance = balances.find(
        (wallet) => wallet.id === fixture.senderWalletId,
      );
      const recipientBalance = balances.find(
        (wallet) => wallet.id === fixture.recipientWalletId,
      );

      expect(String(senderBalance?.balance)).toBe('400.00');
      expect(String(recipientBalance?.balance)).toBe('200.00');

      // Confirm that only one transaction was created for this key.
      const transactionCountPlan = db.raw.sql`
        SELECT COUNT(*)::text AS "count"
        FROM "public"."Transaction"
        WHERE "initiatedByUserId" = ${fixture.senderUserId}
          AND "idempotencyKey" = ${idempotencyKey}
      `
        .returnsRow({ count: 'pg/text@1' })
        .build();

      const transactionRows = await db.runtime().query(transactionCountPlan);

      expect(transactionRows[0]?.count).toBe('1');
    } finally {
      await cleanupTestWalletFixture(fixture);
    }
  });

  it('rejects reuse of an idempotency key for a different transfer', async () => {
    const fixture = await createTestWalletFixture();
    const idempotencyKey = `transfer-conflict-${randomUUID()}`;

    try {
      // First request succeeds.
      await transfersService.transfer(
        fixture.senderUserId,
        {
          destinationWalletId: fixture.recipientWalletId,
          amount: '100.00',
        },
        idempotencyKey,
      );

      // Reusing the key with a different amount must fail.
      await expect(
        transfersService.transfer(
          fixture.senderUserId,
          {
            destinationWalletId: fixture.recipientWalletId,
            amount: '200.00',
          },
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // The rejected request must not change either wallet balance.
      const balancesPlan = db.raw.sql`
      SELECT "id", "balance"
      FROM "public"."Wallet"
      WHERE "id" IN (
        ${fixture.senderWalletId},
        ${fixture.recipientWalletId}
      )
    `
        .returnsRow({
          id: 'pg/text@1',
          balance: 'pg/numeric@1',
        })
        .build();

      const balances = await db.runtime().query(balancesPlan);

      const senderBalance = balances.find(
        (wallet) => wallet.id === fixture.senderWalletId,
      );
      const recipientBalance = balances.find(
        (wallet) => wallet.id === fixture.recipientWalletId,
      );

      expect(String(senderBalance?.balance)).toBe('400.00');
      expect(String(recipientBalance?.balance)).toBe('200.00');
    } finally {
      await cleanupTestWalletFixture(fixture);
    }
  });

  it('rejects transfers with insufficient funds without changing financial records', async () => {
    const fixture = await createTestWalletFixture();
    const idempotencyKey = `transfer-insufficient-${randomUUID()}`;

    try {
      await expect(
        transfersService.transfer(
          fixture.senderUserId,
          {
            destinationWalletId: fixture.recipientWalletId,
            amount: '1000.00',
          },
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // Both balances must remain unchanged.
      const balancesPlan = db.raw.sql`
      SELECT "id", "balance"
      FROM "public"."Wallet"
      WHERE "id" IN (
        ${fixture.senderWalletId},
        ${fixture.recipientWalletId}
      )
    `
        .returnsRow({
          id: 'pg/text@1',
          balance: 'pg/numeric@1',
        })
        .build();

      const balances = await db.runtime().query(balancesPlan);

      const senderBalance = balances.find(
        (wallet) => wallet.id === fixture.senderWalletId,
      );
      const recipientBalance = balances.find(
        (wallet) => wallet.id === fixture.recipientWalletId,
      );

      expect(String(senderBalance?.balance)).toBe('500.00');
      expect(String(recipientBalance?.balance)).toBe('100.00');

      // No transaction should have been recorded for the failed request.
      const transactionPlan = db.raw.sql`
      SELECT COUNT(*)::text AS "count"
      FROM "public"."Transaction"
      WHERE "initiatedByUserId" = ${fixture.senderUserId}
        AND "idempotencyKey" = ${idempotencyKey}
    `
        .returnsRow({ count: 'pg/text@1' })
        .build();

      const transactions = await db.runtime().query(transactionPlan);
      expect(transactions[0]?.count).toBe('0');

      // No ledger entries should have been created for the failed request.
      const ledgerPlan = db.raw.sql`
      SELECT COUNT(*)::text AS "count"
      FROM "public"."LedgerEntry" AS le
      INNER JOIN "public"."Transaction" AS t
        ON t."id" = le."transactionId"
      WHERE t."initiatedByUserId" = ${fixture.senderUserId}
        AND t."idempotencyKey" = ${idempotencyKey}
    `
        .returnsRow({ count: 'pg/text@1' })
        .build();

      const ledgerEntries = await db.runtime().query(ledgerPlan);
      expect(ledgerEntries[0]?.count).toBe('0');
    } finally {
      await cleanupTestWalletFixture(fixture);
    }
  });
});
