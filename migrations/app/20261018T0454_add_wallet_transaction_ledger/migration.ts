#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/cf7be466fe68a6bccb73dd45439592af2e79a96ddd6f11e24282eda05350d897/contract';
import endContract from '../../snapshots/cf7be466fe68a6bccb73dd45439592af2e79a96ddd6f11e24282eda05350d897/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fa876b2c174ebccdf78763370321df1f0a45692af96cf61efcc7981b84b942f3/contract';
import startContract from '../../snapshots/fa876b2c174ebccdf78763370321df1f0a45692af96cf61efcc7981b84b942f3/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'LedgerEntry',
        columns: [
          col('amount', 'numeric(19,2)', {
            notNull: true,
            codecRef: {
              codecId: 'pg/numeric@1',
              typeParams: { precision: 19, scale: 2 },
            },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('entryType', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('transactionId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('walletId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'LedgerEntry_entryType_check_7634fd97',
            "\"entryType\" IN ('DEBIT', 'CREDIT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Transaction',
        columns: [
          col('amount', 'numeric(19,2)', {
            notNull: true,
            codecRef: {
              codecId: 'pg/numeric@1',
              typeParams: { precision: 19, scale: 2 },
            },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('NGN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('destinationWalletId', 'text', {
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('idempotencyKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('initiatedByUserId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('sourceWalletId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Transaction_status_check_bc4cb609',
            "\"status\" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED')",
          ),
          checkExpression(
            'Transaction_type_check_37ebe6f2',
            "\"type\" IN ('TRANSFER', 'DEPOSIT', 'WITHDRAWAL')",
          ),
        ],
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'Wallet',
        column: 'balance',
        options: {
          qualifiedTargetType: 'numeric(19,2)',
          formatTypeExpected: 'numeric(19,2)',
          rawTargetTypeForLabel: 'numeric(19,2)',
        },
      }),
      this.addUnique({
        schema: 'public',
        table: 'Transaction',
        constraint: 'Transaction_initiatedByUserId_idempotencyKey_key',
        columns: ['initiatedByUserId', 'idempotencyKey'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'User',
        constraint: 'User_role_check_1954e8c0',
        expression: "\"role\" IN ('USER', 'ADMIN')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'User',
        constraint: 'User_status_check_5dec1c59',
        expression: "\"status\" IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Wallet',
        constraint: 'Wallet_status_check_166abea7',
        expression: "\"status\" IN ('ACTIVE', 'FROZEN', 'CLOSED')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'LedgerEntry',
        index: 'LedgerEntry_transactionId_idx_d3180832',
        columns: ['transactionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LedgerEntry',
        index: 'LedgerEntry_walletId_createdAt_idx_5931d2fb',
        columns: ['walletId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LedgerEntry',
        index: 'LedgerEntry_walletId_idx_2e003173',
        columns: ['walletId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Transaction',
        index: 'Transaction_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Transaction',
        index: 'Transaction_destinationWalletId_idx_b60ffc63',
        columns: ['destinationWalletId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Transaction',
        index: 'Transaction_initiatedByUserId_idx_cae329cf',
        columns: ['initiatedByUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Transaction',
        index: 'Transaction_sourceWalletId_idx_2e316d30',
        columns: ['sourceWalletId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LedgerEntry',
        foreignKey: {
          name: 'LedgerEntry_transactionId_fkey',
          columns: ['transactionId'],
          references: {
            schema: 'public',
            table: 'Transaction',
            columns: ['id'],
          },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LedgerEntry',
        foreignKey: {
          name: 'LedgerEntry_walletId_fkey',
          columns: ['walletId'],
          references: { schema: 'public', table: 'Wallet', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Transaction',
        foreignKey: {
          name: 'Transaction_initiatedByUserId_fkey',
          columns: ['initiatedByUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Transaction',
        foreignKey: {
          name: 'Transaction_sourceWalletId_fkey',
          columns: ['sourceWalletId'],
          references: { schema: 'public', table: 'Wallet', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Transaction',
        foreignKey: {
          name: 'Transaction_destinationWalletId_fkey',
          columns: ['destinationWalletId'],
          references: { schema: 'public', table: 'Wallet', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
