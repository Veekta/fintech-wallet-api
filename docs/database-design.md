## 1. Database

The application will use PostgreSQL as its primary relational database.

PostgreSQL is suitable for this system because financial operations require:

- ACID transactions
- Strong consistency
- Relational data modeling
- Foreign key constraints
- Database-level constraints
- Row-level locking
- Reliable numeric types
- Transaction isolation

The application will interact with PostgreSQL through Prisma.

---

## 2. User

The `User` entity represents a registered user of the platform.

### Fields

| Field        | Type     | Description                 |
| ------------ | -------- | --------------------------- |
| id           | UUID     | Unique user identifier      |
| email        | String   | User's unique email address |
| passwordHash | String   | Securely hashed password    |
| name         | String   | User's name                 |
| role         | Enum     | User's system role          |
| status       | Enum     | User account status         |
| createdAt    | DateTime | Account creation timestamp  |
| updatedAt    | DateTime | Last update timestamp       |

### Role

The initial roles are:

```text
USER
ADMIN
```

### Status

The initial account statuses are:

```text
ACTIVE
SUSPENDED
```

### Constraints

- `email` must be unique.
- Passwords must never be stored in plaintext.
- User IDs must be unique.
- Suspended users must not be allowed to perform restricted financial operations.

---

## 3. Wallet

The `Wallet` entity represents a user's account for holding digital funds.

### Fields

| Field     | Type     | Description               |
| --------- | -------- | ------------------------- |
| id        | UUID     | Unique wallet identifier  |
| userId    | UUID     | Owner of the wallet       |
| balance   | Decimal  | Current wallet balance    |
| currency  | String   | Wallet currency           |
| status    | Enum     | Wallet status             |
| createdAt | DateTime | Wallet creation timestamp |
| updatedAt | DateTime | Last update timestamp     |

### Status

The initial wallet statuses are:

```text
ACTIVE
SUSPENDED
```

### Constraints

- Every wallet must belong to a valid user.
- `userId` must reference an existing user.
- A user can initially have only one wallet.
- Balance must not become negative through a valid financial operation.
- Monetary values must use an exact decimal representation rather than floating-point numbers.

---

## 4. Transaction

The `Transaction` entity represents a financial operation performed by the system.

A transaction is different from a ledger entry.

The transaction describes the overall financial operation, while ledger entries describe the individual financial effects of that operation.

### Fields

| Field               | Type     | Description                   |
| ------------------- | -------- | ----------------------------- |
| id                  | UUID     | Unique transaction identifier |
| type                | Enum     | Type of financial operation   |
| status              | Enum     | Current transaction state     |
| amount              | Decimal  | Transaction amount            |
| currency            | String   | Transaction currency          |
| sourceWalletId      | UUID     | Wallet funds originate from   |
| destinationWalletId | UUID     | Wallet receiving funds        |
| createdAt           | DateTime | Creation timestamp            |
| updatedAt           | DateTime | Last update timestamp         |

### Transaction Types

The initial transaction types are:

```text
TRANSFER
DEPOSIT
WITHDRAWAL
```

### Transaction Status

The initial transaction statuses are:

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

### Constraints

- Transaction amount must be greater than zero.
- Source and destination wallets must exist when required.
- A completed transfer must have valid source and destination wallets.
- A transaction must not be processed more than once.
- Failed transactions must not leave financial state partially modified.
- Every completed financial transaction must have corresponding ledger entries.

---

## 5. LedgerEntry

The `LedgerEntry` entity records the financial effect of a transaction on a wallet.

A simple wallet transfer produces two ledger entries:

```text
DEBIT  → Source Wallet
CREDIT → Destination Wallet
```

### Fields

| Field         | Type     | Description                         |
| ------------- | -------- | ----------------------------------- |
| id            | UUID     | Unique ledger entry identifier      |
| transactionId | UUID     | Transaction that produced the entry |
| walletId      | UUID     | Wallet affected by the entry        |
| type          | Enum     | CREDIT or DEBIT                     |
| amount        | Decimal  | Amount recorded                     |
| createdAt     | DateTime | Creation timestamp                  |

### Ledger Entry Types

```text
DEBIT
CREDIT
```

### Example

For:

```text
Wallet A → Wallet B
₦20,000
```

the system creates:

```text
Ledger Entry 1
----------------
wallet: A
type: DEBIT
amount: ₦20,000
```

and:

```text
Ledger Entry 2
----------------
wallet: B
type: CREDIT
amount: ₦20,000
```

Therefore:

```text
Total Debits = Total Credits
```

The ledger provides an auditable record of financial movements.

---

## 6. Relationships

### User → Wallet

A user initially has one wallet.

```text
User 1 ───────── 1 Wallet
```

The wallet contains a foreign key referencing the user.

---

### Wallet → Transaction

A wallet can participate in many transactions.

A transaction may reference a wallet as either:

- Source wallet
- Destination wallet

```text
Wallet 1 ──────── N Transactions
```

A transaction therefore has two wallet relationships:

```text
sourceWallet
destinationWallet
```

---

### Transaction → LedgerEntry

A transaction can produce multiple ledger entries.

For a basic transfer:

```text
Transaction 1 ──────── N LedgerEntries
```

A completed transfer should have at least:

```text
1 DEBIT
1 CREDIT
```

---

### Wallet → LedgerEntry

A wallet can have many ledger entries.

```text
Wallet 1 ──────── N LedgerEntries
```

These entries provide the historical financial activity associated with the wallet.

---

## 7. Entity Relationship Overview

```text
┌──────────────┐
│     User     │
├──────────────┤
│ id           │
│ email        │
│ passwordHash │
│ name         │
│ role         │
│ status       │
└──────┬───────┘
       │
       │ 1:1
       ▼
┌──────────────┐
│    Wallet    │
├──────────────┤
│ id           │
│ userId       │
│ balance      │
│ currency     │
│ status       │
└──────┬───────┘
       │
       │
       ├──────────────────────┐
       │                      │
       ▼                      ▼
┌────────────────┐     ┌────────────────┐
│  Transaction   │     │  LedgerEntry   │
├────────────────┤     ├────────────────┤
│ id             │     │ id             │
│ type           │     │ transactionId  │
│ status         │     │ walletId       │
│ amount         │     │ type           │
│ currency       │     │ amount         │
│ sourceWalletId │     │ createdAt      │
│ destination... │     └────────────────┘
└────────────────┘
        │
        │ 1:N
        ▼
   Ledger Entries
```

---

## 8. Financial Invariants

Financial invariants are rules that must remain true regardless of application state or transaction volume.

### Balance Integrity

A wallet must not be allowed to spend more money than it has available.

```text
Available Balance >= Transfer Amount
```

---

### Double-Entry Integrity

A completed transfer must contain matching financial effects.

```text
Total Debits = Total Credits
```

For example:

```text
DEBIT  ₦20,000
CREDIT ₦20,000
```

---

### Atomicity

A financial operation must either complete entirely or have no financial effect.

For a transfer:

```text
Debit Source
Credit Destination
Create Transaction
Create Ledger Entries
```

These operations must be treated as one atomic database operation.

If one operation fails, the other financial modifications must be rolled back.

---

### No Duplicate Processing

A financial transaction must not be processed multiple times.

The system must eventually support idempotency mechanisms to protect against duplicate requests.

---

### Auditability

Every completed financial operation must be traceable through its transaction and ledger entries.

The system should be able to answer:

> Where did this money come from?

and:

> Where did this money go?

---

### Referential Integrity

Records must not reference non-existent entities.

For example:

```text
Wallet.userId
        ↓
User.id
```

and:

```text
LedgerEntry.transactionId
        ↓
Transaction.id
```

must always reference valid records.

---

## 9. Monetary Data

Financial amounts will use PostgreSQL's exact numeric/decimal type.

Floating-point types such as:

```text
FLOAT
DOUBLE
```

will not be used for monetary balances.

The system will represent monetary values using an exact decimal representation.

---

## 10. Indexing Strategy

Indexes will be added to fields that are frequently used for lookups and relationships.

Initial candidates include:

```text
users.email
wallets.userId
transactions.sourceWalletId
transactions.destinationWalletId
transactions.status
ledger_entries.transactionId
ledger_entries.walletId
```

Indexes will be reviewed and optimized as query patterns become known.

We will avoid adding unnecessary indexes because indexes also increase storage requirements and write overhead.

---

## 11. Data Consistency and Transactions

Operations that modify multiple financial records must use database transactions.

For example, a transfer may modify:

```text
Transaction
Wallet A
Wallet B
Ledger Entry A
Ledger Entry B
```

These changes must be committed together.

Conceptually:

```text
BEGIN

Create transaction

Debit Wallet A

Credit Wallet B

Create debit ledger entry

Create credit ledger entry

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

The database should return to the state that existed before the financial operation began.

---

## 12. Future Database Considerations

The initial database model is intentionally simple.

As the platform evolves, additional entities may be introduced, including:

```text
RefreshToken
IdempotencyKey
Deposit
Withdrawal
Payment
Webhook
AuditLog
Currency
ExchangeRate
```

These will only be introduced when they are required by actual product or architectural requirements.

The initial goal is to build a correct and understandable financial core before introducing additional complexity.
