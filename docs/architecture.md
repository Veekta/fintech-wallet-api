# Fintech Wallet & Ledger API — System Architecture

## 1. Architecture Overview

The Fintech Wallet & Ledger API uses a **modular monolith architecture** built with NestJS and TypeScript.

The application runs as a single backend application while organizing its functionality into separate modules responsible for authentication, users, wallets, transfers, transaction history, and administration.

PostgreSQL is the persistent data store. The application accesses it through a custom Prisma 8 RC database integration, including a contract-based schema and runtime query interface.

The architecture prioritizes:

- Separation of concerns.
- Clear business-domain boundaries.
- Financial consistency.
- Secure authentication and authorization.
- Testability.
- Maintainability.
- Explicit database transaction handling.
- Simplicity before unnecessary infrastructure complexity.

This document describes the current learning project. It does not represent a production deployment architecture or a security certification.

## 2. Why a Modular Monolith?

The project uses a modular monolith instead of microservices because its current requirements do not justify independently deployed services or the additional complexity of distributed transactions and inter-service communication.

The modular monolith provides:

- A single application to build and deploy.
- Clear separation between business domains.
- Simpler local development and debugging.
- Direct module-to-module integration.
- Easier coordination of database transactions.
- Straightforward automated testing.
- The option to extract a domain into a separate service if future requirements justify it.

A modular monolith does not mean that the application should be implemented as one large module. Each business domain should maintain a clear responsibility and expose its functionality through appropriate controllers, providers, and service interfaces.

Microservices, message brokers, and distributed coordination are not required for the current scope.

## 3. High-Level Architecture

```text
                    CLIENT
                       |
                       v
                HTTP / REST API
                       |
                       v
             NestJS Request Pipeline
                       |
          +------------+------------+
          |                         |
          v                         v
   Authentication              Validation
   and Authorization           and Guards
          |                         |
          +------------+------------+
                       |
                       v
                  Controllers
                       |
                       v
                   Services
              Business Operations
                       |
                       v
              Database Integration
              Custom Prisma Runtime
                       |
                       v
                  PostgreSQL
```

The general request flow is:

1. A client sends an HTTP request.
2. NestJS routes the request to the appropriate controller.
3. Authentication and authorization guards protect the applicable routes.
4. The controller delegates business operations to a service.
5. The service validates business rules and coordinates database operations.
6. The database integration executes the required queries or transaction.
7. The controller returns the result to the client.

Controllers handle HTTP concerns. Services coordinate business logic. Database access and financial consistency should remain explicit rather than being hidden inside controller code.

## 4. Application Modules

The application is organized around the following business domains.

```text
src/
├── auth/
├── users/
├── wallets/
├── transfers/
├── transactions/
├── admin/
├── prisma/
└── main.ts
```

The precise files within each module may evolve. The directory tree represents the principal areas of responsibility, not a guarantee that every domain has an independently implemented module.

### 4.1 Auth Module

The Auth module handles authentication and token-related operations.

Responsibilities include:

- User registration.
- Login.
- Argon2 password hashing and verification.
- JWT access-token verification.
- Refresh-token handling and rotation.
- Authentication guards.
- Authentication-related account-status checks.

The module uses the Users module to retrieve current user information when required by authentication.

The JWT authentication guard verifies the token and checks the current database user. Suspended or deactivated accounts cannot continue accessing protected endpoints using an otherwise unexpired access token.

### 4.2 Users Module

The Users module provides user lookup and access to account information required by the application.

Responsibilities include:

- Retrieving users by email.
- Retrieving users by ID.
- Providing account status and role information.
- Supporting authentication and authorization decisions.

The current user model includes identity fields, a password hash, role, account status, and timestamps.

The application defines `USER` and `ADMIN` roles, along with `ACTIVE`, `SUSPENDED`, and `DEACTIVATED` account statuses.

Public registration does not allow clients to assign themselves the administrator role.

### 4.3 Wallets Module

The Wallets domain represents user wallets and provides access to wallet information.

Responsibilities include:

- Retrieving the authenticated user's wallet.
- Representing wallet balances and currency.
- Maintaining wallet ownership relationships.
- Supporting wallet operations and transfer workflows.

The current wallet model includes a user relationship, balance, currency, status, and timestamps.

A wallet is associated with a user through a unique user identifier. The current API exposes the authenticated user's wallet through:

```http
GET /api/v1/wallets/me
```

Wallet balance changes must be coordinated through controlled financial operations rather than unrestricted client updates.

### 4.4 Transfers Module

The Transfers domain coordinates movement of funds between wallets.

Responsibilities include:

- Validating transfer requests.
- Identifying the source wallet associated with the authenticated user.
- Validating the recipient wallet.
- Checking available funds.
- Applying debit and credit operations.
- Enforcing idempotency.
- Coordinating transaction and ledger updates.
- Protecting against concurrent spending.
- Maintaining atomic financial state changes.

The implemented transfer endpoint is:

```http
POST /api/v1/wallets/transfers
```

Transfers use database transaction handling and locking safeguards to prevent partial financial updates and important race conditions.

The source wallet is determined from the authenticated user, rather than allowing the client to freely choose another user's source wallet.

### 4.5 Transactions Domain

The transaction model represents a financial operation and its lifecycle.

The current transaction entity includes:

- Initiating user.
- Transaction type.
- Transaction status.
- Amount and currency.
- Source and destination wallet references where applicable.
- Idempotency key.
- Creation and update timestamps.

Transaction types include:

- `TRANSFER`
- `DEPOSIT`
- `WITHDRAWAL`

Transaction statuses include:

- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `REVERSED`

These types and statuses describe the data model. They do not mean that every transaction type has a corresponding implemented API workflow.

The implemented transaction-history endpoint is:

```http
GET /api/v1/wallets/transactions
```

It supports pagination and filters for transaction type, status, and date range. Results are scoped to the authenticated user's wallet and ordered newest first.

Administrative transaction listing is provided separately through the Admin module.

### 4.6 Ledger

The ledger is represented through the `LedgerEntry` data model and the financial operations that create ledger records.

A ledger entry records the financial effect of a transaction against a wallet.

The current ledger entry model includes:

- Transaction reference.
- Wallet reference.
- Entry type.
- Amount.
- Creation timestamp.

Entry types include `DEBIT` and `CREDIT`.

For example, a ₦20,000 transfer from Wallet A to Wallet B produces the following financial entries:

```text
Transaction: Transfer ₦20,000

Wallet A
  DEBIT   ₦20,000

Wallet B
  CREDIT  ₦20,000
```

The transfer's wallet changes, transaction record, and ledger entries must be coordinated within the same database transaction.

The ledger data model provides a foundation for financial traceability. A complete reconciliation service, immutable audit platform, and independent ledger-balancing process are not part of the current documented scope.

### 4.7 Admin Module

The Admin module provides administrative endpoints for managing user accounts and viewing transaction activity.

Current responsibilities include:

- Listing users.
- Filtering and paginating users.
- Retrieving a user's details.
- Updating account status.
- Listing and filtering transactions.

Implemented administrative routes include:

```http
GET   /api/v1/admin/users
GET   /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id/status
GET   /api/v1/admin/transactions
```

Administrative routes are protected by JWT authentication and role-based authorization.

The account-status update service includes safeguards against invalid statuses, self-suspension or self-deactivation by the acting administrator, and suspension or deactivation of the last active administrator.

Dedicated administrative wallet endpoints and individual transaction-detail endpoints should not be considered implemented unless they are added to the application.

## 5. Domain Relationships

The main relationships between the database entities are:

```text
User
  |
  | One user has an associated wallet
  v
Wallet
  |
  +--------------------+
  |                    |
  v                    v
Transaction        LedgerEntry
  |
  +-- Source wallet (where applicable)
  |
  +-- Destination wallet (where applicable)
  |
  +-- Ledger entries associated with the transaction
```

The principal relationships are:

- A user has an associated wallet.
- A transaction records the user who initiated it.
- A transaction may reference source and destination wallets.
- A transaction may have multiple ledger entries.
- Each ledger entry references a transaction and wallet.
- Refresh-token records are associated with users.

These relationships support wallet ownership, transaction history, authentication, and the recording of financial movements.

## 6. Transfer Processing Architecture

Transfers are among the most sensitive operations in the application because multiple financial records must remain consistent.

The high-level flow is:

```text
Client
  |
  v
Transfer Controller
  |
  v
Transfer Service
  |
  +-- Validate request
  |
  +-- Resolve authenticated user's source wallet
  |
  +-- Validate recipient and transfer conditions
  |
  +-- Validate idempotency
  |
  v
Database Transaction
  |
  +-- Apply concurrency safeguards
  |
  +-- Validate available funds
  |
  +-- Create transaction record
  |
  +-- Debit source wallet
  |
  +-- Credit destination wallet
  |
  +-- Create debit ledger entry
  |
  +-- Create credit ledger entry
  |
  v
Commit on success
or rollback on failure
```

The database transaction is the consistency boundary for the related financial changes.

If a required operation fails, the transaction should roll back rather than leave the source wallet, destination wallet, transaction record, and ledger entries in inconsistent states.

### Financial invariants

The transfer implementation is designed to protect the following invariants:

1. A user cannot initiate an unauthorized transfer from another user's wallet.
2. A transfer must satisfy the required amount and business validations.
3. Available funds must be checked safely.
4. Duplicate requests must not create duplicate financial operations.
5. Related financial changes must be atomic.
6. Concurrent transfers must not spend the same available funds twice.
7. A successful transfer must have the corresponding ledger records.

These guarantees depend on the correct implementation of the service logic, database transaction boundaries, locking strategy, and database constraints.

## 7. Database Architecture

PostgreSQL is the application's primary persistent data store.

The application uses a custom Prisma 8 RC integration with a contract-based database definition and runtime query interface. Database access is not accurately described as a conventional Prisma Client-only integration.

The principal database entities are:

| Entity         | Responsibility                                                |
| -------------- | ------------------------------------------------------------- |
| `User`         | User identity, credentials, role, and account status          |
| `Wallet`       | Wallet ownership, balance, currency, and status               |
| `Transaction`  | Financial operation metadata and lifecycle                    |
| `LedgerEntry`  | Debit and credit records associated with financial operations |
| `RefreshToken` | Refresh-token/session records                                 |

The database contract also defines enums for user roles, account statuses, wallet statuses, transaction types, transaction statuses, and ledger entry types.

### Database integration

The current database integration is initialized in:

```text
src/prisma/db.ts
```

The integration uses:

- A database contract.
- Contract JSON metadata.
- A PostgreSQL connection URL supplied through environment configuration.
- A runtime query interface.
- Transaction-scoped query operations where atomic changes are required.

The custom database integration should be treated as the project's actual data-access layer. New database operations must follow its supported query and transaction APIs rather than assuming that every conventional Prisma Client method is available.

### Database transactions

Database transactions are required when an operation modifies multiple related records that must succeed or fail together.

Examples include:

- User and wallet creation during registration.
- Transfer transaction creation.
- Source and destination wallet updates.
- Debit and credit ledger-entry creation.
- Sensitive administrative account-status changes.

The exact transaction boundary depends on the operation and its implementation.

## 8. Data Access and Dependency Direction

The intended dependency flow is:

```text
HTTP Controller
      |
      v
Business Service
      |
      v
Database Integration
      |
      v
PostgreSQL
```

Controllers should remain thin and should not contain complex financial calculations or extensive database orchestration.

Services should coordinate the operation's business rules and determine when database transaction handling is required.

The database layer should handle persistence. It should not replace the service layer as the place where application-level business workflows are defined.

The Auth module uses the Users module for current-user lookups. The Admin module uses authentication and authorization components to protect administrative operations.

## 9. Authentication and Authorization Architecture

The application separates authentication from authorization.

### Authentication

The JWT guard:

1. Reads the bearer token from the request.
2. Verifies the token.
3. Validates the expected user identifier and role claims.
4. Retrieves the current user from the database.
5. Rejects missing, unavailable, or inactive users.
6. Uses the current database role for the authenticated request.

The access token has a configured 15-minute lifetime.

### Authorization

The application uses a role decorator and role guard to protect administrative routes.

The primary roles are:

- `USER`
- `ADMIN`

Administrative controllers require both authentication and the administrator role.

Public registration does not permit users to assign themselves an administrator role.

### Account status

Protected requests check the current database account status. Accounts marked `SUSPENDED` or `DEACTIVATED` cannot continue accessing protected routes simply because an access token remains unexpired.

Additional security controls, including rate limiting, multi-factor authentication, and comprehensive persistent security audit logging, are not documented as implemented in the current scope.

## 10. API Layer

The application exposes a REST API under the global version prefix:

```text
/api/v1
```

The principal implemented API areas are:

### Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

### Wallet and transfers

```text
GET  /api/v1/wallets/me
POST /api/v1/wallets/transfers
GET  /api/v1/wallets/transactions
```

### Administration

```text
GET   /api/v1/admin/users
GET   /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id/status
GET   /api/v1/admin/transactions
```

These routes represent the current documented scope. Any change to controllers or route definitions should be reflected in the API design document.

## 11. Testing Architecture

The project uses Vitest for automated testing and TypeScript compilation for build verification.

Testing covers important business and security behavior across authentication, wallet operations, transfers, transaction history, and administration.

Current documented test areas include:

- Password and token-related authentication behavior.
- Missing, invalid, and expired access tokens.
- Current account-status enforcement.
- Current database role enforcement.
- Role guard behavior.
- Transfer idempotency and financial consistency.
- Insufficient-funds behavior.
- Concurrent transfer safeguards.
- Wallet-scoped transaction history.
- Pagination and query filtering.
- Administrative user and transaction operations.
- Administrative account-status safeguards.

Service-level tests and mocked database interactions provide useful feedback, but they do not replace integration tests against a real PostgreSQL instance.

Database locking, transaction behavior, migrations, and other persistence-sensitive operations should be verified against the actual database in addition to unit tests.

## 12. Development and Configuration

The project is developed as a Node.js and TypeScript application using NestJS.

The local environment uses PostgreSQL, with Docker available for running the database.

Configuration is supplied through environment variables, including the database connection URL and authentication secrets.

Local development, testing, and production should use separate configuration and credentials.

The administrator seed script is a separate development and operational utility. It creates an administrator through the dedicated seeding process rather than exposing administrator-role assignment through public registration.

Database setup, schema changes, and contract verification should follow the project's documented Prisma integration workflow.

## 13. Financial Consistency and Failure Handling

The architecture treats financial correctness as a primary requirement.

The application is designed to prevent:

- Partial transfer updates.
- Duplicate transfer processing.
- Unauthorized wallet operations.
- Concurrent spending beyond available funds.
- Transaction records becoming inconsistent with wallet changes.
- Successful transfers without their corresponding ledger entries.

Financial operations should fail safely. If a required database operation fails, the transaction should not commit partial financial changes.

A production system would require additional operational capabilities, including reconciliation, monitoring, backup restoration, incident handling, and stronger audit controls.

## 14. Scalability and Future Architecture

The current modular monolith is sufficient for the project's present learning and implementation scope.

Future infrastructure should be introduced only when supported by actual requirements.

Potential future additions include:

| Technology or capability         | Potential purpose                                        |
| -------------------------------- | -------------------------------------------------------- |
| Redis                            | Shared caching or distributed rate limiting              |
| Background job processing        | Asynchronous non-critical work                           |
| Message broker                   | Event-driven integration with other services             |
| Object storage                   | Statements and generated documents                       |
| Observability platform           | Centralized logs, metrics, and tracing                   |
| Payment provider integration     | Deposits, withdrawals, and external payment confirmation |
| Dedicated reconciliation service | Independent financial consistency checks                 |

These are possible future improvements, not components currently claimed to be deployed.

If the application grows to require independently deployed services, individual business domains can be evaluated for extraction. Such a transition should account for data ownership, transaction boundaries, reliability, and operational overhead.

## 15. Current Scope and Limitations

The current project implements core wallet API functionality for learning and demonstrating backend engineering principles.

Implemented capabilities include:

- User registration and login.
- Access-token authentication.
- Refresh-token handling.
- User and account-status lookup.
- Wallet retrieval.
- Wallet-to-wallet transfers.
- Transfer idempotency.
- Transaction and ledger updates.
- Transaction-history filtering and pagination.
- Administrative user management.
- Administrative transaction listing.
- Role-based access control.
- Automated tests for important security and financial scenarios.

The following are not part of the currently documented implemented scope:

- Real deposit and withdrawal processing.
- Payment provider or banking integrations.
- Multi-factor authentication.
- KYC verification.
- Fraud detection and transaction monitoring.
- Comprehensive persistent audit logging.
- A dedicated reconciliation platform.
- Independently deployed microservices.
- Production infrastructure and compliance certification.

The existence of transaction types or database fields for future features does not mean the corresponding business workflows are available.

## 16. Architectural Principles

The project follows these principles:

1. Keep HTTP concerns separate from business logic.
2. Organize the application around clear business domains.
3. Prefer a modular monolith until distributed architecture is justified.
4. Treat financial operations as atomic database operations.
5. Maintain consistency between wallet changes, transactions, and ledger entries.
6. Enforce authentication and authorization on the backend.
7. Validate data at system boundaries.
8. Protect against duplicate and concurrent financial operations.
9. Make important business rules testable.
10. Keep database integration explicit and consistent with the project's custom Prisma runtime.
11. Avoid exposing secrets or unnecessary sensitive data.
12. Document implemented capabilities separately from planned functionality.

The architecture should evolve incrementally as requirements become clearer, with financial correctness and maintainability taking priority over unnecessary complexity.
