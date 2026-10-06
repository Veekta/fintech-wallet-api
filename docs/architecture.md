## 1. Architecture Overview

The Fintech Wallet & Ledger API will use a **modular monolith architecture** built with NestJS.

The application will be deployed as a single backend application while its internal functionality is separated into independent business modules.

This approach provides separation of concerns and clear domain boundaries without introducing the operational complexity of microservices.

The initial architecture will prioritize:

- Simplicity
- Maintainability
- Clear domain boundaries
- Financial correctness
- Security
- Testability
- Transactional consistency
- Future scalability

---

## 2. Why a Modular Monolith?

We are choosing a modular monolith instead of microservices because the system is still being developed as a single product and there is currently no strong requirement to distribute the application across multiple independently deployed services.

A modular monolith gives us:

- Separation of concerns
- Clear business domains
- Simpler deployment
- Simpler debugging
- Lower infrastructure complexity
- Easier database transactions
- Easier local development
- The ability to extract modules into services later if the system requires it

We will avoid introducing distributed-system complexity before it is necessary.

If a particular domain eventually requires independent scaling, deployment, or ownership, it can be extracted into a separate service.

---

## 3. High-Level Architecture

```text
                         CLIENT
                           │
                           ▼
                  ┌─────────────────┐
                  │   HTTP / REST   │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Controllers   │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Services     │
                  │ Business Logic  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Data Access   │
                  │     Prisma      │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   PostgreSQL    │
                  └─────────────────┘
```

The application will follow the general flow:

```text
HTTP Request
     ↓
Controller
     ↓
Business Service
     ↓
Database Access
     ↓
PostgreSQL
```

Controllers should handle HTTP concerns, while business rules should primarily live inside services.

---

## 4. Application Modules

The initial application will contain the following major modules:

```text
src/
│
├── auth/
├── users/
├── wallets/
├── transfers/
├── transactions/
├── ledger/
├── admin/
│
├── database/
├── common/
└── main.ts
```

### Auth Module

Responsible for authentication and identity verification.

Responsibilities include:

- User registration
- Login
- Password hashing
- JWT authentication
- Refresh token handling
- Authentication guards
- Authentication-related security

The Auth module answers:

> Who are you?

---

### Users Module

Responsible for managing user information and account status.

Responsibilities include:

- User profile information
- Email
- Name
- Account status
- User roles
- User lookup

The Users module answers:

> What do we know about this user?

---

### Wallets Module

Responsible for representing and managing user wallets.

Responsibilities include:

- Wallet creation
- Wallet balance
- Wallet currency
- Wallet status
- Wallet ownership
- Wallet retrieval

The Wallet module answers:

> Where are the user's funds held?

---

### Transfers Module

Responsible for orchestrating the movement of funds between wallets.

Responsibilities include:

- Validating transfer requests
- Identifying source and destination wallets
- Checking available balance
- Creating transfer operations
- Coordinating debit and credit operations
- Ensuring transfers are processed atomically

The Transfers module answers:

> Why and how is money moving between wallets?

---

### Transactions Module

Responsible for the lifecycle and history of financial operations.

Responsibilities include:

- Recording financial operations
- Transaction status
- Transaction type
- Transaction amount
- Transaction history
- Tracking successful and failed operations

Example transaction lifecycle:

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├──────────────► FAILED
   │
   ▼
COMPLETED
```

A transaction represents the financial operation itself, not the wallet.

---

### Ledger Module

Responsible for maintaining the financial record of the system.

The ledger records the financial effects of transactions.

For example, a ₦20,000 transfer from Wallet A to Wallet B creates:

```text
Wallet A
DEBIT
₦20,000

Wallet B
CREDIT
₦20,000
```

The ledger should provide an auditable history of financial movements.

For completed transfers:

```text
Total Debits = Total Credits
```

The Ledger module answers:

> What actually happened financially?

---

### Admin Module

Responsible for administrative operations.

Responsibilities include:

- Viewing users
- Viewing wallets
- Viewing transactions
- Monitoring transaction activity
- Investigating failed transactions
- Managing user account status

Administrative functionality will be protected using role-based authorization.

---

## 5. Domain Relationships

The major domain relationships are:

```text
User
 │
 │ 1:1
 ▼
Wallet
 │
 │
 ├───────────────┐
 │               │
 ▼               ▼
Transactions   Ledger Entries
```

A user owns a wallet.

A wallet participates in transactions.

Transactions produce ledger entries that record their financial effects.

---

## 6. Transfer Request Flow

When User A transfers ₦20,000 to User B, the request will follow this general flow:

```text
Client
  │
  ▼
Transfer Controller
  │
  ▼
Transfer Service
  │
  ├── Validate authenticated user
  │
  ├── Validate recipient
  │
  ├── Validate transfer amount
  │
  ├── Retrieve source wallet
  │
  ├── Retrieve destination wallet
  │
  ├── Check available balance
  │
  ├── Create transaction
  │
  ├── Debit source wallet
  │
  ├── Credit destination wallet
  │
  └── Create ledger entries
          │
          ▼
   Database Transaction
          │
          ▼
      PostgreSQL
```

The financial changes must be performed atomically.

The transfer should either:

1. Complete all required financial changes successfully.

or:

2. Fail without leaving the financial system in a partially updated state.

---

## 7. Financial Consistency

Financial correctness is a core architectural requirement.

The system must protect the following invariants:

- Money must not disappear.
- Money must not be accidentally created.
- Wallet balances must not become invalid.
- Duplicate transfers must be prevented.
- Unauthorized transactions must be prevented.
- A transfer must not partially complete.
- Every financial operation must have an auditable record.
- Wallet balances and ledger records must remain consistent.
- Concurrent transactions must not allow double spending.
- Failed transactions must not corrupt financial state.

---

## 8. Database Strategy

PostgreSQL will be the primary persistent data store.

Prisma will provide the application's database access layer.

The initial database entities will include:

```text
User
Wallet
Transaction
LedgerEntry
```

Authentication itself is an application module rather than a database entity.

Additional persistence models such as:

```text
RefreshToken
IdempotencyKey
```

may be introduced as the system develops.

---

## 9. Data Access

Application services will interact with PostgreSQL through Prisma.

The intended dependency flow is:

```text
Controller
    ↓
Service
    ↓
Prisma
    ↓
PostgreSQL
```

Controllers should not contain complex database or financial business logic.

Financial operations should be coordinated within the appropriate service layer and executed using database transactions where multiple records must change atomically.

---

## 10. Security Architecture

Security will be applied across multiple layers.

### Authentication

Protected endpoints require an authenticated user.

### Authorization

Roles and permissions will determine whether an authenticated user can perform an operation.

### Input Validation

All externally supplied data must be validated before entering business logic.

### Financial Authorization

A user must only be able to initiate operations against wallets they are authorized to access.

### Secrets

Sensitive configuration such as:

- Database credentials
- JWT secrets
- API keys

must be provided through environment configuration and must not be committed to source control.

---

## 11. Future Scalability

The initial architecture is intentionally simple.

As the system grows, individual components may be introduced or extracted where justified.

Potential future infrastructure includes:

```text
Redis
  ↓
Caching / rate limiting / distributed coordination

BullMQ
  ↓
Background jobs

Message Broker
  ↓
Event-driven communication

Object Storage
  ↓
Documents / statements

Observability
  ↓
Logs / metrics / tracing
```

The system should evolve based on actual requirements rather than introducing distributed architecture prematurely.

---

## 12. Architectural Principles

The project will follow these principles:

1. Keep business logic separate from HTTP concerns.
2. Keep modules focused on specific business domains.
3. Protect financial state through database transactions.
4. Treat financial operations as auditable events.
5. Prefer simple architecture until complexity is justified.
6. Validate input at system boundaries.
7. Protect sensitive operations through authentication and authorization.
8. Design for correctness before optimization.
9. Make important business rules testable.
10. Prefer explicit behavior over hidden side effects.
