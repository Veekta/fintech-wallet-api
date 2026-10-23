import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';
import { normalizeAmount } from './utils/normalize-amount.js';
import { randomUUID } from 'node:crypto';

interface LockedWallet {
  id: string;
  userId: string;
  balance: string;
  currency: string;
  status: string;
}

interface ExistingTransfer {
  id: string;
  amount: string;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  currency: string;
  status: string;
}

/**
 * The validated information required to initiate a wallet transfer.
 *
 * The sender's user ID is intentionally not included here. It must come
 * from the authenticated JWT, never from client-supplied request data.
 */
interface TransferInput {
  destinationWalletId: string;
  amount: string;
}

/**
 * The public result returned after a transfer is completed or an
 * identical request is safely retried.
 *
 * Amounts remain strings to avoid floating-point precision loss.
 */
export interface TransferResult {
  id: string;
  type: 'TRANSFER';
  status: string;
  amount: string;
  currency: string;
  sourceWalletId: string;
  destinationWalletId: string;
}

@Injectable()
export class TransfersService {
  /**
   * Locks the supplied wallet rows for the duration of a transaction.
   * Wallet IDs must be locked in sorted order to reduce deadlock risk.
   */
  private async lockWallets(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    walletIds: string[],
  ): Promise<LockedWallet[]> {
    const sortedIds = [...new Set(walletIds)].sort();

    const lockedWallets: LockedWallet[] = [];

    for (const walletId of sortedIds) {
      const plan = db.raw.sql`
        SELECT
          "id",
          "userId",
          "balance",
          "currency",
          "status"
        FROM "public"."Wallet"
        WHERE "id" = ${walletId}
        FOR UPDATE
      `
        .returnsRow({
          id: 'pg/text@1',
          userId: 'pg/text@1',
          balance: 'pg/numeric@1',
          currency: 'pg/text@1',
          status: 'pg/text@1',
        })
        .build();

      const rows = await tx.query(plan);

      if (rows[0]) {
        lockedWallets.push({
          id: rows[0].id,
          userId: rows[0].userId,
          balance: String(rows[0].balance),
          currency: rows[0].currency,
          status: rows[0].status,
        });
      }
    }

    return lockedWallets;
  }

  /**
   * Locks the initiating user's database row for the duration of the
   * current transaction.
   *
   * WHY THIS IS NEEDED:
   * Two transfer requests from the same user could arrive concurrently.
   * If both requests use the same idempotency key, they must not both
   * proceed as if the request were new.
   *
   * HOW IT WORKS:
   * - SELECT finds the user by their ID.
   * - FOR UPDATE acquires a row-level lock on that user.
   * - If another transaction already holds this lock, PostgreSQL makes
   *   this query wait until that transaction finishes.
   * - Once the lock becomes available, the caller can check for an
   *   existing transaction before attempting another transfer.
   *
   * IMPORTANT:
   * This method must run inside a database transaction. The lock is
   * held until that transaction commits or rolls back.
   *
   * @returns true if the user exists, otherwise false.
   */
  private async lockInitiatingUser(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
  ): Promise<boolean> {
    const plan = db.raw.sql`
    SELECT "id"
    FROM "public"."User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `
      .returnsRow({
        id: 'pg/text@1',
      })
      .build();

    const rows = await tx.query(plan);

    return rows.length > 0;
  }

  /**
   * Looks for a transaction previously created using the same user ID
   * and idempotency key.
   *
   * WHY THIS IS NEEDED:
   * A client might submit a transfer successfully but never receive the
   * response because of a network failure. It may retry the request.
   * We need to recognize that retry instead of transferring the money
   * a second time.
   *
   * HOW IT WORKS:
   * - Searches the Transaction table using the initiating user's ID
   *   and the supplied idempotency key.
   * - Returns null when no matching transaction exists.
   * - Returns the existing transaction details when a match is found.
   *
   * IMPORTANT:
   * Finding a transaction does not automatically mean the new request
   * is identical to the original request. The caller must compare the
   * destination wallet and normalized amount before reusing the result.
   *
   * The amount is converted to a string to preserve its decimal
   * representation rather than using JavaScript floating-point math.
   *
   * @returns The existing transaction, or null if none is found.
   */
  private async findExistingTransfer(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    idempotencyKey: string,
  ): Promise<ExistingTransfer | null> {
    const plan = db.raw.sql`
    SELECT
      "id",
      "amount",
      "sourceWalletId",
      "destinationWalletId",
      "currency",
      "status"
    FROM "public"."Transaction"
    WHERE "initiatedByUserId" = ${userId}
      AND "idempotencyKey" = ${idempotencyKey}
    LIMIT 1
  `
      .returnsRow({
        id: 'pg/text@1',
        amount: 'pg/numeric@1',
        sourceWalletId: 'pg/text@1',
        destinationWalletId: 'pg/text@1',
        currency: 'pg/text@1',
        status: 'pg/text@1',
      })
      .build();

    const rows = await tx.query(plan);
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      amount: String(row.amount),
      sourceWalletId: row.sourceWalletId,
      destinationWalletId: row.destinationWalletId,
      currency: row.currency,
      status: row.status,
    };
  }

  /**
   * Finds a wallet in the collection returned by lockWallets().
   *
   * The wallet rows have already been locked by PostgreSQL, so the caller
   * can safely validate their current balances and statuses within the
   * same transaction.
   *
   * @returns The matching locked wallet, or undefined if it was not found.
   */
  private findLockedWallet(
    wallets: LockedWallet[],
    walletId: string,
  ): LockedWallet | undefined {
    return wallets.find((wallet) => wallet.id === walletId);
  }

  /**
   * Validates the sender and recipient after their rows have been locked.
   *
   * It rejects self-transfers, inactive wallets, and currency mismatches.
   * Checking these conditions after acquiring the locks ensures that the
   * values are read while the relevant wallet rows are protected.
   */
  private validateWallets(sender: LockedWallet, recipient: LockedWallet): void {
    if (sender.id === recipient.id) {
      throw new BadRequestException(
        'You cannot transfer money to your own wallet',
      );
    }

    if (sender.status !== 'ACTIVE') {
      throw new ConflictException('Your wallet is not active');
    }

    if (recipient.status !== 'ACTIVE') {
      throw new ConflictException('The destination wallet is not active');
    }

    if (sender.currency !== recipient.currency) {
      throw new ConflictException('Both wallets must use the same currency');
    }
  }

  /**
   * Debits the sender's wallet only when sufficient funds are available.
   *
   * PostgreSQL performs the subtraction directly on the NUMERIC balance,
   * avoiding JavaScript floating-point arithmetic.
   *
   * The balance condition and update happen in one SQL statement. If the
   * wallet cannot cover the amount, no row is updated and the method
   * returns false.
   *
   * This method must run inside the transfer transaction, after the wallet
   * has been locked and its status validated.
   */
  private async debitWallet(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    walletId: string,
    amount: string,
  ): Promise<boolean> {
    const plan = db.raw.sql`
    UPDATE "public"."Wallet"
    SET
      "balance" = "balance" - ${amount}::numeric,
      "updatedAt" = NOW()
    WHERE "id" = ${walletId}
      AND "balance" >= ${amount}::numeric
    RETURNING "id"
  `
      .returnsRow({
        id: 'pg/text@1',
      })
      .build();

    const rows = await tx.query(plan);

    return rows.length > 0;
  }

  /**
   * Credits the recipient's wallet with the transfer amount.
   *
   * PostgreSQL performs the addition directly on the NUMERIC balance,
   * avoiding JavaScript floating-point arithmetic.
   *
   * The method returns true when the recipient wallet is updated.
   * It returns false if no wallet matches the supplied ID.
   *
   * This method must run inside the same database transaction as the
   * sender's debit. If this credit fails and the error is thrown, the
   * enclosing transaction must roll back the debit as well.
   */
  private async creditWallet(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    walletId: string,
    amount: string,
  ): Promise<boolean> {
    const plan = db.raw.sql`
    UPDATE "public"."Wallet"
    SET
      "balance" = "balance" + ${amount}::numeric,
      "updatedAt" = NOW()
    WHERE "id" = ${walletId}
    RETURNING "id"
  `
      .returnsRow({
        id: 'pg/text@1',
      })
      .build();

    const rows = await tx.query(plan);

    return rows.length > 0;
  }

  /**
   * Creates the main transaction record for an internal wallet transfer.
   *
   * The transaction describes the overall operation: who initiated it,
   * which wallets are involved, the amount, currency, and final status.
   *
   * A successful internal transfer is recorded as COMPLETED because the
   * debit, credit, and ledger entries will be committed atomically.
   *
   * Raw SQL is used because the Prisma 8 RC numeric input type requires
   * a branded value; this method accepts an exact decimal string instead.
   *
   * IMPORTANT:
   * This method must run inside the same database transaction as the
   * wallet balance updates and ledger entries.
   */
  private async createTransferRecord(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    senderWalletId: string,
    recipientWalletId: string,
    amount: string,
    currency: string,
    idempotencyKey: string,
  ): Promise<TransferResult> {
    const transactionId = randomUUID();

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
      "idempotencyKey",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${transactionId},
      ${userId},
      'TRANSFER',
      'COMPLETED',
      ${amount}::numeric,
      ${currency},
      ${senderWalletId},
      ${recipientWalletId},
      ${idempotencyKey},
      NOW(),
      NOW()
    )
    RETURNING
      "id",
      "type",
      "status",
      "amount",
      "currency",
      "sourceWalletId",
      "destinationWalletId"
  `
      .returnsRow({
        id: 'pg/text@1',
        type: 'pg/text@1',
        status: 'pg/text@1',
        amount: 'pg/numeric@1',
        currency: 'pg/text@1',
        sourceWalletId: 'pg/text@1',
        destinationWalletId: 'pg/text@1',
      })
      .build();

    const rows = await tx.query(plan);
    const row = rows[0];

    if (!row || !row.sourceWalletId || !row.destinationWalletId) {
      throw new Error('Failed to create transfer record');
    }

    return {
      id: row.id,
      type: 'TRANSFER',
      status: 'COMPLETED',
      amount: normalizeAmount(String(row.amount)),
      currency: row.currency,
      sourceWalletId: row.sourceWalletId,
      destinationWalletId: row.destinationWalletId,
    };
  }

  /**
   * Creates the two ledger entries that account for an internal transfer.
   *
   * A transfer produces one DEBIT entry for the sender and one CREDIT
   * entry for the recipient. Both entries reference the same transaction.
   *
   * The entries are inserted in one SQL statement and must run inside the
   * same database transaction as the balance updates and transaction
   * record. If the insert fails, the enclosing transaction must roll back.
   */
  private async createLedgerEntries(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    transactionId: string,
    senderWalletId: string,
    recipientWalletId: string,
    amount: string,
  ): Promise<void> {
    const debitEntryId = randomUUID();
    const creditEntryId = randomUUID();

    const plan = db.raw.sql`
  INSERT INTO "public"."LedgerEntry" (
    "id",
    "transactionId",
    "walletId",
    "entryType",
    "amount",
    "createdAt"
  )
  VALUES
    (
      ${debitEntryId},
      ${transactionId},
      ${senderWalletId},
      'DEBIT',
      ${amount}::numeric,
      NOW()
    ),
    (
      ${creditEntryId},
      ${transactionId},
      ${recipientWalletId},
      'CREDIT',
      ${amount}::numeric,
      NOW()
    )
`
      .affectedCount()
      .build();

    await tx.execute(plan);
  }

  /**
   * Coordinates an internal wallet transfer.
   *
   * The user lock serializes transfer requests from the same user.
   * The idempotency lookup then determines whether this is a new request
   * or a retry of an existing transfer.
   
   */
  async transfer(
    userId: string,
    input: TransferInput,
    idempotencyKey: string,
  ): Promise<TransferResult> {
    return db.transaction(async (tx) => {
      // Lock the user row so concurrent transfer requests from this user
      // cannot simultaneously pass the idempotency check.
      const userExists = await this.lockInitiatingUser(tx, userId);

      if (!userExists) {
        throw new NotFoundException('Initiating user not found');
      }

      // Check whether this user has already used this idempotency key.
      const existing = await this.findExistingTransfer(
        tx,
        userId,
        idempotencyKey,
      );

      if (existing) {
        // Normalize both amounts before comparing them, so "100" and
        // "100.00" are treated as the same monetary value.
        const existingAmount = normalizeAmount(existing.amount);
        const requestedAmount = normalizeAmount(input.amount);

        const sameRequest =
          existing.destinationWalletId === input.destinationWalletId &&
          existingAmount === requestedAmount;

        if (!sameRequest) {
          throw new ConflictException(
            'Idempotency key has already been used for a different transfer',
          );
        }
        // Return the original transaction instead of moving money again.
        if (!existing.sourceWalletId) {
          throw new ConflictException('Existing transfer has no source wallet');
        }

        return {
          id: existing.id,
          type: 'TRANSFER',
          status: existing.status,
          amount: existingAmount,
          currency: existing.currency,
          sourceWalletId: existing.sourceWalletId,
          destinationWalletId: existing.destinationWalletId!,
        };
      }

      // Find the sender's wallet using the authenticated user's ID.
      // Never trust the client to specify which wallet sends the money.
      const senderLookupPlan = db.raw.sql`
  SELECT "id"
  FROM "public"."Wallet"
  WHERE "userId" = ${userId}
  LIMIT 1
`
        .returnsRow({
          id: 'pg/text@1',
        })
        .build();

      const senderRows = await tx.query(senderLookupPlan);
      const senderWalletId = senderRows[0]?.id;

      if (!senderWalletId) {
        throw new NotFoundException('Sender wallet not found');
      }

      // Prevent transferring to the same wallet before attempting to lock it.
      if (senderWalletId === input.destinationWalletId) {
        throw new BadRequestException(
          'You cannot transfer money to your own wallet',
        );
      }

      // Lock both wallets in a deterministic order.
      // This reduces deadlock risk when concurrent transfers involve the same
      // pair of wallets in opposite directions.
      const lockedWallets = await this.lockWallets(tx, [
        senderWalletId,
        input.destinationWalletId,
      ]);

      const sender = this.findLockedWallet(lockedWallets, senderWalletId);
      const recipient = this.findLockedWallet(
        lockedWallets,
        input.destinationWalletId,
      );

      if (!sender) {
        throw new NotFoundException('Sender wallet not found');
      }

      if (!recipient) {
        throw new NotFoundException('Destination wallet not found');
      }

      // Validate wallet status, currency compatibility, and self-transfer rules
      // while both wallet rows are locked.
      this.validateWallets(sender, recipient);

      // Normalize the requested amount to two decimal places.
      // Keep the amount as a string to avoid floating-point arithmetic.
      const amount = normalizeAmount(input.amount);

      // Ask PostgreSQL to compare the monetary values exactly.
      const balanceCheckPlan = db.raw.sql`
        SELECT ("balance" >= ${amount}::numeric) AS "hasSufficientFunds"
        FROM "public"."Wallet"
        WHERE "id" = ${sender.id}
      `
        .returnsRow({
          hasSufficientFunds: 'pg/bool@1',
        })
        .build();

      const balanceRows = await tx.query(balanceCheckPlan);

      // Stop the transfer if the sender does not have enough money.
      if (!balanceRows[0]?.hasSufficientFunds) {
        throw new UnprocessableEntityException('Insufficient wallet balance');
      }

      // Debit the sender's wallet.
      // The SQL update checks the balance again before deducting money.
      const debited = await this.debitWallet(tx, sender.id, amount);

      if (!debited) {
        throw new UnprocessableEntityException('Insufficient wallet balance');
      }

      // Credit the recipient's wallet with the same amount.
      const credited = await this.creditWallet(tx, recipient.id, amount);

      if (!credited) {
        throw new NotFoundException('Destination wallet could not be credited');
      }

      // Record the completed transfer in the transaction table.
      // This remains part of the same database transaction as the
      // wallet debit and credit.
      const transferRecord = await this.createTransferRecord(
        tx,
        userId,
        sender.id,
        recipient.id,
        amount,
        sender.currency,
        idempotencyKey,
      );

      // Record both sides of the transfer in the ledger.
      // These entries are committed atomically with the wallet updates
      // and the transaction record.
      await this.createLedgerEntries(
        tx,
        transferRecord.id,
        sender.id,
        recipient.id,
        amount,
      );

      // Return the completed transfer details to the controller.
      return transferRecord;
    });
  }
}
