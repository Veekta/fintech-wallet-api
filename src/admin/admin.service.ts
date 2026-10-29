import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';

export interface AdminTransactionsQuery {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdminTransactionRow {
  id: string;
  initiatedByUserId: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  createdAt: string;
}

export interface AdminUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
}

interface CountRow {
  total: string;
}

@Injectable()
export class AdminService {
  async getUsers(query: AdminUsersQuery) {
    const page = this.parsePositiveInteger(query.page, 1, 'page');
    const limit = this.parsePositiveInteger(query.limit, 20, 'limit');

    if (limit > 100) {
      throw new BadRequestException('limit cannot be greater than 100');
    }

    const search = query.search?.trim() ?? '';
    const role = query.role?.trim().toUpperCase() ?? '';
    const status = query.status?.trim().toUpperCase() ?? '';

    const allowedRoles = ['USER', 'ADMIN'];
    const allowedStatuses = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'];

    if (role && !allowedRoles.includes(role)) {
      throw new BadRequestException('Invalid role filter');
    }

    if (status && !allowedStatuses.includes(status)) {
      throw new BadRequestException('Invalid status filter');
    }

    const hasSearch = search.length > 0;
    const hasRole = role.length > 0;
    const hasStatus = status.length > 0;
    const offset = (page - 1) * limit;

    const countPlan = db.raw.sql`
      SELECT COUNT(*)::text AS "total"
      FROM "public"."User" u
      WHERE (
        ${hasSearch} = false
        OR u."email" ILIKE ${`%${search}%`}
        OR u."name" ILIKE ${`%${search}%`}
      )
      AND (${hasRole} = false OR u."role" = ${role})
      AND (${hasStatus} = false OR u."status" = ${status})
    `
      .returnsRow({ total: 'pg/text@1' })
      .build();

    const countRows = await db.runtime().query(countPlan);
    const countRow = countRows[0] as CountRow | undefined;
    const total = Number(countRow?.total ?? '0');

    const dataPlan = db.raw.sql`
      SELECT
        u."id",
        u."email",
        u."name",
        u."role",
        u."status",
        u."createdAt"::text AS "createdAt"
      FROM "public"."User" u
      WHERE (
        ${hasSearch} = false
        OR u."email" ILIKE ${`%${search}%`}
        OR u."name" ILIKE ${`%${search}%`}
      )
      AND (${hasRole} = false OR u."role" = ${role})
      AND (${hasStatus} = false OR u."status" = ${status})
      ORDER BY u."createdAt" DESC, u."id" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
      .returnsRow({
        id: 'pg/text@1',
        email: 'pg/text@1',
        name: 'pg/text@1',
        role: 'pg/text@1',
        status: 'pg/text@1',
        createdAt: 'pg/text@1',
      })
      .build();

    const rows = await db.runtime().query(dataPlan);

    return {
      data: rows as AdminUserRow[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserById(id: string) {
    const userPlan = db.raw.sql`
      SELECT
        u."id",
        u."email",
        u."name",
        u."role",
        u."status",
        u."createdAt"::text AS "createdAt",
        w."id" AS "walletId",
        w."balance"::text AS "balance",
        w."currency" AS "currency",
        w."status" AS "walletStatus",
        w."createdAt"::text AS "walletCreatedAt"
      FROM "public"."User" u
      LEFT JOIN "public"."Wallet" w
        ON w."userId" = u."id"
      WHERE u."id" = ${id}
      LIMIT 1
    `
      .returnsRow({
        id: 'pg/text@1',
        email: 'pg/text@1',
        name: 'pg/text@1',
        role: 'pg/text@1',
        status: 'pg/text@1',
        createdAt: 'pg/text@1',
        walletId: 'pg/text@1',
        balance: 'pg/text@1',
        currency: 'pg/text@1',
        walletStatus: 'pg/text@1',
        walletCreatedAt: 'pg/text@1',
      })
      .build();

    const rows = await db.runtime().query(userPlan);
    const user = rows[0] as
      | {
          id: string;
          email: string;
          name: string | null;
          role: string;
          status: string;
          createdAt: string;
          walletId: string | null;
          balance: string | null;
          currency: string | null;
          walletStatus: string | null;
          walletCreatedAt: string | null;
        }
      | undefined;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const {
      walletId,
      balance,
      currency,
      walletStatus,
      walletCreatedAt,
      ...userDetails
    } = user;

    return {
      ...userDetails,
      wallet: walletId
        ? {
            id: walletId,
            balance,
            currency,
            status: walletStatus,
            createdAt: walletCreatedAt,
          }
        : null,
    };
  }

  async updateUserStatus(id: string, status: string, actingAdminId: string) {
    const normalizedStatus = status.trim().toUpperCase();
    const allowedStatuses = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'];

    if (!allowedStatuses.includes(normalizedStatus)) {
      throw new BadRequestException(
        'Status must be ACTIVE, SUSPENDED, or DEACTIVATED',
      );
    }

    return db.transaction(async (tx) => {
      // Serialize admin status changes so concurrent requests cannot
      // both pass the last-active-administrator check.
      const lockPlan = db.raw.sql`
  SELECT pg_advisory_xact_lock(728194) AS "locked"
`
        .returnsRow({
          locked: 'pg/bool@1',
        })
        .build();

      await tx.query(lockPlan);

      // Lock the target user and retrieve their current role and status.
      const targetPlan = db.raw.sql`
      SELECT "id", "role", "status"
      FROM "public"."User"
      WHERE "id" = ${id}
      FOR UPDATE
    `
        .returnsRow({
          id: 'pg/text@1',
          role: 'pg/text@1',
          status: 'pg/text@1',
        })
        .build();

      const targetRows = await tx.query(targetPlan);
      const target = targetRows[0] as
        { id: string; role: string; status: string } | undefined;

      if (!target) {
        throw new NotFoundException('User not found');
      }

      // Administrators must not suspend or deactivate their own account.
      if (
        target.id === actingAdminId &&
        ['SUSPENDED', 'DEACTIVATED'].includes(normalizedStatus)
      ) {
        throw new BadRequestException(
          'You cannot suspend or deactivate your own account',
        );
      }

      // Prevent removing the final active administrator.
      const isRemovingActiveAdmin =
        target.role === 'ADMIN' &&
        target.status === 'ACTIVE' &&
        ['SUSPENDED', 'DEACTIVATED'].includes(normalizedStatus);

      if (isRemovingActiveAdmin) {
        const countPlan = db.raw.sql`
        SELECT COUNT(*)::text AS "total"
        FROM "public"."User"
        WHERE "role" = 'ADMIN'
          AND "status" = 'ACTIVE'
      `
          .returnsRow({ total: 'pg/text@1' })
          .build();

        const countRows = await tx.query(countPlan);
        const countRow = countRows[0] as { total: string } | undefined;
        const activeAdminCount = Number(countRow?.total ?? '0');

        if (activeAdminCount <= 1) {
          throw new BadRequestException(
            'Cannot suspend or deactivate the last active administrator',
          );
        }
      }

      const updatePlan = db.raw.sql`
      UPDATE "public"."User"
      SET
        "status" = ${normalizedStatus},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
      RETURNING
        "id",
        "email",
        "name",
        "role",
        "status",
        "updatedAt"::text AS "updatedAt"
    `
        .returnsRow({
          id: 'pg/text@1',
          email: 'pg/text@1',
          name: 'pg/text@1',
          role: 'pg/text@1',
          status: 'pg/text@1',
          updatedAt: 'pg/text@1',
        })
        .build();

      const rows = await tx.query(updatePlan);
      const user = rows[0];

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    });
  }

  async getTransactions(query: AdminTransactionsQuery) {
    const page = this.parsePositiveInteger(query.page, 1, 'page');
    const limit = this.parsePositiveInteger(query.limit, 20, 'limit');

    if (limit > 100) {
      throw new BadRequestException('limit cannot be greater than 100');
    }

    const type = query.type?.trim().toUpperCase() ?? '';
    const status = query.status?.trim().toUpperCase() ?? '';

    const allowedTypes = ['TRANSFER', 'DEPOSIT', 'WITHDRAWAL'];
    const allowedStatuses = [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'REVERSED',
    ];

    if (type && !allowedTypes.includes(type)) {
      throw new BadRequestException('Invalid transaction type');
    }

    if (status && !allowedStatuses.includes(status)) {
      throw new BadRequestException('Invalid transaction status');
    }

    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must not be later than endDate');
    }

    const hasType = Boolean(type);
    const hasStatus = Boolean(status);
    const hasStartDate = Boolean(query.startDate);
    const hasEndDate = Boolean(query.endDate);

    const start = query.startDate
      ? `${query.startDate}T00:00:00.000Z`
      : '1970-01-01T00:00:00.000Z';

    const endExclusive = query.endDate
      ? new Date(`${query.endDate}T00:00:00.000Z`).getTime() +
        24 * 60 * 60 * 1000
      : 0;

    if (
      (query.startDate && !Number.isFinite(Date.parse(start))) ||
      (query.endDate &&
        !Number.isFinite(Date.parse(`${query.endDate}T00:00:00.000Z`)))
    ) {
      throw new BadRequestException('Dates must be valid ISO dates');
    }

    const offset = (page - 1) * limit;

    const countPlan = db.raw.sql`
      SELECT COUNT(*)::text AS "total"
      FROM "public"."Transaction" t
      WHERE (${hasType} = false OR t."type" = ${type})
      AND (${hasStatus} = false OR t."status" = ${status})
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
    `
      .returnsRow({ total: 'pg/text@1' })
      .build();

    const countRows = await db.runtime().query(countPlan);
    const countRow = countRows[0] as { total: string } | undefined;
    const total = Number(countRow?.total ?? '0');

    const dataPlan = db.raw.sql`
      SELECT
        t."id",
        t."initiatedByUserId",
        t."type",
        t."status",
        t."amount"::text AS "amount",
        t."currency",
        t."sourceWalletId",
        t."destinationWalletId",
        t."createdAt"::text AS "createdAt"
      FROM "public"."Transaction" t
      WHERE (${hasType} = false OR t."type" = ${type})
      AND (${hasStatus} = false OR t."status" = ${status})
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
      ORDER BY t."createdAt" DESC, t."id" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
      .returnsRow({
        id: 'pg/text@1',
        initiatedByUserId: 'pg/text@1',
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
      data: rows as AdminTransactionRow[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private parsePositiveInteger(
    value: number | undefined,
    defaultValue: number,
    field: string,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }

    return value;
  }
}
