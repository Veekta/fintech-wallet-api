# Fintech Wallet & Ledger API — Database Design

## 1. Database Overview

The Fintech Wallet & Ledger API uses PostgreSQL as its primary relational database.

The database stores user accounts, wallets, authentication refresh-token records, financial transactions, and ledger entries.

The database design prioritizes:

- Referential integrity.
- Atomic financial operations.
- Exact monetary representation.
- Protection against duplicate transfer processing.
- Concurrency safety.
- Traceability of financial movements.
- Clear relationships between users, wallets, transactions, and ledger entries.

The application uses a custom Prisma 8 RC integration with a contract-based schema and runtime query interface. Database operations must follow the supported APIs of this integration.

This document describes the current database model and its intended financial invariants. It does not claim that every invariant is enforced by a database constraint alone.

## 2. Database Technology

| Component                | Technology                                      |
| ------------------------ | ----------------------------------------------- |
| Database                 | PostgreSQL                                      |
| Database integration     | Custom Prisma 8 RC contract/runtime integration |
| Database contract        | `src/prisma/contract.prisma`                    |
| Contract metadata        | `src/prisma/contract.json`                      |
| Database runtime         | `src/prisma/db.ts`                              |
| Connection configuration | `DATABASE_URL`                                  |
| Local database           | PostgreSQL through Docker                       |

The contract defines the database models, fields, relationships, and enum types used by the application.

The runtime initializes the database connection using the configured connection URL and contract metadata.

Database schema changes must follow the project's established contract and migration workflow.

## 3. Entity Overview

The current database contains the following principal models:

| Model          | Purpose                                                     |
| -------------- | ----------------------------------------------------------- |
| `User`         | Stores user identity, credentials, role, and account status |
| `Wallet`       | Stores wallet ownership, balance, currency, and status      |
| `RefreshToken` | Supports refresh-token/session handling                     |
| `Transaction`  | Represents a financial operation                            |
| `LedgerEntry`  | Records the financial effect of a transaction on a wallet   |

The database also defines enums for roles, statuses, transaction types, and ledger entry types.

Deposits and withdrawals appear as transaction types in the schema, but dedicated deposit and withdrawal workflows are not implemented in the current project scope.

## 4. User Model

The `User` model represents a registered platform user.

### Fields

| Field          | Type / representation | Description               |
| -------------- | --------------------- | ------------------------- |
| `id`           | Text identifier       | Unique user identifier    |
| `email`        | String                | User's email address      |
| `passwordHash` | String                | Argon2 password hash      |
| `name`         | Nullable string       | User's display name       |
| `role`         | `UserRole` enum       | User's authorization role |
| `status`       | `UserStatus` enum     | Account status            |
| `createdAt`    | Timestamp             | Account creation time     |
| `updatedAt`    | Timestamp             | Last update time          |

The exact database types and constraints are defined by the Prisma contract.

### Roles

The `UserRole` enum includes:

- `USER`
- `ADMIN`

The role determines which role-protected operations a user may perform.

Public registration does not allow a client to assign itself the `ADMIN` role. Administrator accounts are created through the separate seed process.

### Account statuses

The `UserStatus` enum includes:

- `ACTIVE`
- `SUSPENDED`
- `DEACTIVATED`

The authentication guard checks the current account status in the database. Suspended and deactivated users cannot continue accessing protected endpoints using an otherwise valid, unexpired access token.

### Constraints and security considerations

- User IDs must be unique.
- Email uniqueness should be enforced by the schema or database constraint.
- Passwords are stored as hashes, never as plaintext.
- Administrative access is controlled by role-based authorization.
- Account-status changes must follow the safeguards implemented in the Admin service.

## 5. Wallet Model

The `Wallet` model represents a user's wallet.

### Fields

| Field       | Type / representation  | Description              |
| ----------- | ---------------------- | ------------------------ |
| `id`        | Text identifier        | Unique wallet identifier |
| `userId`    | Text identifier        | Associated user          |
| `balance`   | Numeric decimal        | Current wallet balance   |
| `currency`  | String / currency code | Wallet currency          |
| `status`    | `WalletStatus` enum    | Wallet status            |
| `createdAt` | Timestamp              | Wallet creation time     |
| `updatedAt` | Timestamp              | Last update time         |

### Wallet status

The `WalletStatus` enum includes:

- `ACTIVE`
- `SUSPENDED`

### Relationships and constraints

- Each wallet belongs to a user.
- `Wallet.userId` references the associated user.
- The current schema enforces a unique user-to-wallet association through the unique `userId` field.
- A user therefore has at most one associated wallet in the current model.
- The balance uses a numeric decimal representation.
- Valid financial operations must not cause the wallet balance to become negative.

### Wallet currency

The default wallet currency is `NGN`.

Currency compatibility must be validated by the financial service before processing a transfer.

### Balance integrity

Wallet balances must only change through controlled financial operations. The API must not expose unrestricted operations that allow clients to set arbitrary balances.

The application must combine service-level validation with database transaction and locking safeguards to protect balances during concurrent transfers.

## 6. RefreshToken Model

The `RefreshToken` model supports refresh-token handling for authenticated users.

It is associated with the `User` model and supports the authentication lifecycle.

Refresh-token records are used by the authentication implementation to manage refresh sessions and token rotation.

The exact fields, expiry behavior, and revocation semantics are defined by the current Prisma contract and authentication services. This document does not assume additional fields or session-management features that have not been verified.

Refresh tokens and related credentials must not be exposed in ordinary user responses or application logs.

## 7. Transaction Model

The `Transaction` model represents a financial operation.

A transaction describes the operation itself. A ledger entry records one of the financial effects associated with that operation.

### Fields

| Field                 | Type / representation    | Description                                 |
| --------------------- | ------------------------ | ------------------------------------------- |
| `id`                  | Text identifier          | Unique transaction identifier               |
| `initiatedByUserId`   | Text identifier          | User who initiated the operation            |
| `type`                | `TransactionType` enum   | Financial operation type                    |
| `status`              | `TransactionStatus` enum | Transaction state                           |
| `amount`              | Numeric decimal          | Transaction amount                          |
| `currency`            | String / currency code   | Transaction currency                        |
| `sourceWalletId`      | Nullable text identifier | Source wallet, where applicable             |
| `destinationWalletId` | Nullable text identifier | Destination wallet, where applicable        |
| `idempotencyKey`      | String                   | Key used for duplicate-operation protection |
| `createdAt`           | Timestamp                | Transaction creation time                   |
| `updatedAt`           | Timestamp                | Last update time                            |

The precise database types and nullability are defined in the Prisma contract.

### Transaction types

The `TransactionType` enum includes:

- `TRANSFER`
- `DEPOSIT`
- `WITHDRAWAL`

The current application implements wallet-to-wallet transfers. The presence of `DEPOSIT` and `WITHDRAWAL` in the enum does not imply that external payment integrations or deposit and withdrawal endpoints are available.

### Transaction statuses

The `TransactionStatus` enum includes:

- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `REVERSED`

These values describe possible transaction states in the schema. The lifecycle transitions permitted by each service depend on the implemented business logic.

### Source and destination wallets

The transaction can reference the wallet from which funds originate and the wallet receiving the funds.

These fields may be nullable to accommodate transaction types that do not use both wallet references.

For a completed wallet-to-wallet transfer, the source and destination must be valid and different wallets.

### Idempotency

The transaction model includes an idempotency key used by the transfer workflow to protect against duplicate processing.

The key must be handled consistently with the transfer service's idempotency logic and the database constraints defined by the contract.

The application must not assume that a field alone guarantees idempotency; correctness also depends on request validation, transaction handling, and concurrency safeguards.

## 8. LedgerEntry Model

The `LedgerEntry` model records the financial effect of a transaction on an individual wallet.

### Fields

| Field           | Type / representation  | Description                    |
| --------------- | ---------------------- | ------------------------------ |
| `id`            | Text identifier        | Unique ledger-entry identifier |
| `transactionId` | Text identifier        | Associated transaction         |
| `walletId`      | Text identifier        | Affected wallet                |
| `entryType`     | `LedgerEntryType` enum | Debit or credit                |
| `amount`        | Numeric decimal        | Amount recorded                |
| `createdAt`     | Timestamp              | Ledger-entry creation time     |

### Ledger entry types

The `LedgerEntryType` enum includes:

- `DEBIT`
- `CREDIT`

### Example: ₦20,000 transfer

Suppose Wallet A transfers ₦20,000 to Wallet B.

The transaction is associated with two ledger entries:

| Entry   | Wallet   | Type     |  Amount |
| ------- | -------- | -------- | ------: |
| Entry 1 | Wallet A | `DEBIT`  | ₦20,000 |
| Entry 2 | Wallet B | `CREDIT` | ₦20,000 |

The entries represent the two financial effects of the transfer.

For a successful transfer, the total debit amount and total credit amount should match.

The transaction record and both ledger entries must be created consistently with the wallet balance changes.

### Ledger integrity

Ledger entries provide a historical record of financial movements. They should not be treated as arbitrary records that can be edited independently of their transactions.

The current project establishes the ledger data model and creates entries as part of transfer processing. A separate reconciliation engine, immutable audit service, and independent ledger-balancing process are not part of the current implementation.

## 9. Entity Relationships

### User and Wallet

A user has an associated wallet through the unique `Wallet.userId` relationship.

```text id="v3q4c2"
User 1 ───────── 0..1 Wallet
```

The user-to-wallet association is unique. Wallet creation during registration is performed within the registration database transaction.

### User and RefreshToken

A user can have associated refresh-token records.

```text id="uy2v82"
User 1 ───────── N RefreshToken
```

The actual lifecycle and retention of refresh-token records are governed by the authentication implementation.

### User and Transaction

The transaction model records the user who initiated the financial operation.

```text id="62rqxj"
User 1 ───────── N Transactions
```

The initiating user reference supports attribution and administrative transaction views.

### Wallet and Transaction

A transaction may reference a source wallet and a destination wallet.

```text id="8ay0n3"
Wallet 1 ──────── N Transactions (source)
Wallet 1 ──────── N Transactions (destination)
```

These are separate relationships because a wallet can send funds in one transaction and receive funds in another.

### Transaction and LedgerEntry

A transaction can have multiple ledger entries.

```text id="7ey3ko"
Transaction 1 ──────── N LedgerEntries
```

For a basic completed transfer, the expected financial effects are one debit and one credit.

### Wallet and LedgerEntry

A wallet can be associated with many ledger entries over time.

```text id="4s9z6o"
Wallet 1 ───────── N LedgerEntries
```

These entries provide the historical financial activity associated with the wallet.

## 10. Entity Relationship Overview

```text id="2c4c0j"
+-------------------+
| User              |
+-------------------+
| id                |
| email             |
| passwordHash      |
| name              |
| role              |
| status            |
| createdAt         |
| updatedAt         |
+-------------------+
    |           |
    |           +--------------------+
    |                                |
    | 1 : 0..1                      | 1 : N
    v                                v
+-------------------+        +-------------------+
| Wallet            |        | RefreshToken      |
+-------------------+        +-------------------+
| id                |
| userId            |
| balance           |
| currency          |
| status            |
| createdAt         |
| updatedAt         |
+-------------------+
    |
    | participates in source/destination
    v
+-------------------+
| Transaction       |
+-------------------+
| id                |
| initiatedByUserId |
| type              |
| status            |
| amount            |
| currency          |
| sourceWalletId    |
| destinationWalletId|
| idempotencyKey    |
| createdAt         |
| updatedAt         |
+-------------------+
    |
    | 1 : N
    v
+-------------------+
| LedgerEntry       |
+-------------------+
| id                |
| transactionId     |
| walletId          |
| entryType         |
| amount            |
| createdAt         |
+-------------------+
```

This diagram illustrates the logical relationships. The actual foreign-key constraints and cardinalities are determined by the Prisma contract.

## 11. Financial Invariants

Financial invariants are conditions that must remain true when financial operations succeed.

### 11.1 Balance integrity

A valid transfer must not spend more than the source wallet's available balance.

```text id="5jtyy3"
Available Balance >= Transfer Amount
```

The balance check must remain safe when multiple requests execute concurrently.

### 11.2 Debit and credit integrity

For a completed wallet-to-wallet transfer:

```text id="t5rhhr"
Total Debits = Total Credits
```

For a transfer of ₦20,000:

```text id="8ah5wm"
DEBIT   ₦20,000
CREDIT  ₦20,000
```

This represents the matching financial effects of the operation.

### 11.3 Atomicity

The following changes must succeed or fail together for a transfer:

- Transaction record creation.
- Source wallet debit.
- Destination wallet credit.
- Debit ledger-entry creation.
- Credit ledger-entry creation.

If one of the required operations fails, the database transaction must roll back the other changes.

### 11.4 Duplicate-processing protection

The transfer workflow uses idempotency to prevent repeated requests from unintentionally creating duplicate transfers.

The database contract, service logic, and transaction handling must work together to preserve this guarantee under concurrent requests and retries.

### 11.5 Referential integrity

Records must reference valid related entities.

Examples include:

- `Wallet.userId` referencing a valid user.
- `Transaction.initiatedByUserId` referencing the initiating user.
- `LedgerEntry.transactionId` referencing a valid transaction.
- `LedgerEntry.walletId` referencing a valid wallet.
- Source and destination wallet references identifying valid wallets when required.

The actual foreign-key constraints should be verified against the generated schema and migration definitions.

### 11.6 Auditability

A completed transfer should be traceable through its transaction record and associated ledger entries.

The data model supports investigation of the operation, its amount, its wallet references, and the recorded financial effects.

A complete independent reconciliation or audit platform remains future work.

## 12. Monetary Data

Financial values use PostgreSQL numeric decimal types.

The wallet balance is defined using a numeric type with precision and scale, rather than a binary floating-point type. The transaction and ledger amount fields also use numeric decimal representations.

The current wallet balance uses a precision of `19` and a scale of `2`.

```text id="k3wj6m"
Numeric(19,2)
```

This supports exact decimal representation for monetary values within the permitted range.

### Monetary rules

- Do not use floating-point arithmetic for financial calculations.
- Validate that amounts are positive where required.
- Respect the precision and scale defined in the database contract.
- Preserve the intended currency throughout a transfer.
- Ensure wallet balance changes and ledger amounts agree.

The API and service layers must validate financial values before writing them to the database.

## 13. Indexing and Query Performance

Indexes should support common lookups and relationships without adding unnecessary write overhead.

Important query patterns include:

- User lookup by email.
- Wallet lookup by user ID.
- Transaction listing by wallet and date.
- Administrative transaction filtering by type, status, and date.
- Ledger lookup by transaction ID.
- Ledger lookup by wallet ID.
- Idempotency-key lookup during transfer processing.

Potential index candidates include:

```text id="c29j9c"
User.email
Wallet.userId
Transaction.initiatedByUserId
Transaction.sourceWalletId
Transaction.destinationWalletId
Transaction.idempotencyKey
LedgerEntry.transactionId
LedgerEntry.walletId
```

These are query-driven index candidates, not a claim that every listed index is already defined in the database contract.

Unique fields and relationship fields should use the appropriate uniqueness constraints or indexes where required by the schema.

Indexes should be reviewed as query patterns and data volumes become clearer. Additional indexes increase storage use and can add overhead to insert and update operations.

## 14. Database Transactions and Concurrency

Financial operations that update multiple related records must use database transactions.

A transfer may modify:

```text id="l82gwm"
Transaction
Source Wallet
Destination Wallet
Source Ledger Entry
Destination Ledger Entry
```

The operation must commit all required changes together.

```text id="6f7b1s"
BEGIN

Create transaction
Debit source wallet
Credit destination wallet
Create debit ledger entry
Create credit ledger entry

COMMIT
```

If a required operation fails:

```text id="x3m6va"
ROLLBACK
```

### Concurrency protection

Concurrent transfers can create race conditions if two requests both read the same available balance before either debit is applied.

The transfer implementation uses database-level locking and transaction safeguards to protect critical wallet operations.

For example, a wallet holding ₦100,000 must not successfully fund two concurrent transfers of ₦80,000 each.

Concurrency protection must be verified against PostgreSQL behavior. Service-level tests are valuable, but integration tests against the actual database are also needed to confirm locking and transaction behavior.

## 15. Schema Changes and Migrations

The Prisma contract is the schema definition used by the project's custom database integration.

Changes to models, fields, enum values, relationships, or constraints should follow the established database workflow.

A schema change should include:

1. Updating the contract.
2. Reviewing the generated or proposed migration.
3. Applying the migration to the appropriate development database.
4. Verifying that the database matches the intended schema.
5. Updating affected services and tests.
6. Running the complete test suite and application build.

Schema changes must be handled carefully because they may affect financial data, database relationships, or existing API behavior.

The project uses contract verification and signing as part of its Prisma workflow. Database verification errors should be resolved before relying on the database contract as verified.

## 16. Future Database Considerations

The following models or capabilities may be introduced when the product requires them:

- Dedicated deposit and withdrawal records or workflows.
- Payment-provider references and webhook records.
- Beneficiary records.
- KYC and identity-verification records.
- Transaction reconciliation records.
- Persistent administrative audit logs.
- Additional currency and exchange-rate models.
- Dedicated reporting or statement-generation data.

These are future considerations rather than claims about the current schema.

The initial objective is to maintain a small, understandable financial core with clear relationships, atomic transfers, and consistent transaction and ledger records.

## 17. Database Design Principles

The database design follows these principles:

1. Use relational constraints to protect data integrity.
2. Store monetary values using exact numeric representations.
3. Keep user, wallet, transaction, and ledger responsibilities distinct.
4. Use foreign keys for entity relationships where defined by the schema.
5. Use database transactions for operations that modify related financial records.
6. Protect concurrent wallet operations with appropriate locking.
7. Use idempotency to reduce duplicate transfer processing.
8. Keep schema changes explicit and reviewable.
9. Add indexes based on actual query patterns.
10. Distinguish current schema capabilities from future financial workflows.
11. Verify database behavior against PostgreSQL rather than relying only on mocked tests.
12. Preserve the consistency of wallet balances, transaction records, and ledger entries.
