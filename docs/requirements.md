# Fintech Wallet & Ledger API — Requirements Document

## 1. Project Overview

The Fintech Wallet & Ledger API is a backend application that enables users to manage digital wallets and perform financial transactions between accounts.

The primary objective is to build a secure and reliable financial system where users can transfer funds to one another while maintaining accurate wallet balances and a consistent financial ledger.

The project focuses on backend engineering principles, including authentication, authorization, database transactions, data integrity, concurrency control, and transaction traceability.

## 2. Problem Statement

### What problem are we solving?

We are solving the problem of digital finance, where users need to receive and send digital money between accounts.

The system must provide a reliable way for users to manage wallet balances and transfer funds to other users without compromising financial integrity.

A financial system must do more than move money. It must also maintain accurate records of every operation, prevent duplicate processing, protect users against unauthorized access, and ensure that wallet balances remain consistent with recorded transactions.

The core problem is therefore:

**How can users securely transfer digital funds between accounts while ensuring that wallet balances and financial records remain consistent, accurate, and traceable?**

## 3. Project Objectives

The project aims to:

1. Provide secure user registration and authentication.
2. Create and manage a wallet for each registered user.
3. Allow users to view their wallet balances.
4. Support secure transfers between users.
5. Maintain a transaction history for wallet activity.
6. Record financial effects through ledger entries.
7. Prevent duplicate transfers and unauthorized financial operations.
8. Protect wallet balances during concurrent transactions.
9. Ensure that related financial changes succeed or fail atomically.
10. Provide administrative capabilities for managing users and monitoring transactions.

## 4. Target Users

The system has two primary user roles.

### 4.1 User

A regular user is an individual who registers on the platform to manage a wallet and perform supported financial operations.

Users can access only their own wallet information and authorized financial activities.

### 4.2 Admin

An administrator is an authorized operator responsible for managing user accounts and monitoring financial activity through protected administrative endpoints.

Administrative access must be restricted to accounts with the `ADMIN` role.

## 5. Functional Requirements

### 5.1 Authentication and account management

The system must support:

- User registration.
- User login.
- Secure password hashing.
- Access-token authentication.
- Refresh-token handling.
- User logout and refresh-token invalidation.
- Account-status checks for protected operations.
- Role-based authorization for administrative endpoints.

Public registration must not allow users to assign themselves administrative privileges.

### 5.2 Wallet management

The system must support:

- Creating a wallet for a registered user.
- Viewing the authenticated user's wallet balance.
- Associating each wallet with its owner.
- Maintaining a wallet currency.
- Restricting wallet access to authorized users.
- Preventing unauthorized changes to wallet balances.

A user must not be able to retrieve or manipulate another user's wallet through an ordinary user endpoint.

### 5.3 Transfers

The system must support secure transfers from one user's wallet to another user's wallet.

A transfer must:

1. Validate the authenticated user.
2. Validate the transfer amount and destination.
3. Verify that the source wallet is accessible and has sufficient funds.
4. Prevent invalid transfers, including transfers to the same wallet.
5. Protect against duplicate requests using idempotency.
6. Record the financial transaction.
7. Debit the source wallet.
8. Credit the destination wallet.
9. Create the corresponding debit and credit ledger entries.
10. Commit all required changes atomically.

If any required step fails, the operation must not leave the wallets, transaction record, and ledger in an inconsistent state.

### 5.4 Transaction history

The system must allow authenticated users to view their wallet transaction history.

Transaction history must support:

- Pagination.
- Filtering by transaction type.
- Filtering by transaction status.
- Date-range filtering.
- Newest-first ordering.
- Wallet ownership enforcement.

A user must not be able to access another user's transaction history through the regular wallet endpoints.

### 5.5 Administrative operations

The system must provide protected administrative endpoints for:

- Listing users.
- Searching and filtering users.
- Viewing an individual user's details.
- Updating user account status.
- Listing and filtering transactions.

Administrative operations must require authentication and the appropriate role.

The system must also protect against unsafe account-status changes, including disabling the last active administrator or allowing an administrator to suspend or deactivate their own account through the protected status-update operation.

## 6. Deposits and Withdrawals

Deposits and withdrawals are part of the broader digital-finance problem and may be introduced in a future phase.

However, the current project scope does not include complete deposit or withdrawal workflows, external payment-provider integration, or payment-gateway settlement.

The current implementation focuses on internal wallet-to-wallet transfers.

The existence of deposit and withdrawal transaction types in the database schema does not mean these operations are available through working API endpoints.

## 7. Non-Functional Requirements

### 7.1 Security

The system must:

- Hash passwords securely.
- Validate access tokens.
- Reject unauthorized requests.
- Enforce role-based access control.
- Check current user account status.
- Restrict wallet and transaction data to authorized users.
- Avoid exposing passwords, password hashes, refresh tokens, or other sensitive credentials in API responses.

### 7.2 Financial integrity

The system must:

- Prevent valid operations from producing negative wallet balances.
- Prevent duplicate transfer processing.
- Ensure that the transaction and ledger records agree with wallet balance changes.
- Preserve the relationship between transactions and their ledger entries.
- Avoid partial financial updates.
- Maintain accurate monetary values using appropriate decimal representations.

### 7.3 Consistency and atomicity

Financial operations involving multiple records must use database transactions.

For a transfer, the transaction record, source debit, destination credit, and corresponding ledger entries must be committed together.

If a required database operation fails, the transaction must roll back.

### 7.4 Concurrency safety

The system must handle concurrent transfer requests without allowing users to spend the same available funds multiple times.

Database locking and transaction safeguards must protect wallet balances during concurrent financial operations.

### 7.5 Reliability

The system must return meaningful errors for invalid requests, unauthorized access, missing records, insufficient funds, and other failed operations.

A failed operation must not leave the financial state partially updated.

### 7.6 Maintainability and testability

The application must use a modular backend structure that separates responsibilities such as authentication, users, wallets, transfers, ledger operations, and administration.

Critical business logic must have automated tests.

## 8. Financial Invariants

Financial invariants are rules that must remain true regardless of the number of users or transactions.

### 8.1 No disappearing money

A successful transfer must be reflected in the relevant wallet balances and transaction records.

### 8.2 No negative balances

A valid transfer must not debit more funds than are available in the source wallet.

### 8.3 No duplicate transfers

Retrying a transfer request must not unintentionally execute the same financial operation more than once.

### 8.4 No unauthorized transfers

A user must not be able to initiate a transfer from another user's wallet without authorization.

### 8.5 No duplicate receipt of funds

A single transfer must not credit the destination wallet more than once as a result of retries or concurrent duplicate requests.

### 8.6 No transaction without its financial effects

A completed transfer must have the corresponding wallet balance changes and ledger entries.

### 8.7 No balance change without a transaction record

Wallet balance changes caused by a financial operation must be accompanied by the corresponding transaction record and ledger entries.

### 8.8 Double-entry consistency

For a completed wallet-to-wallet transfer, the total debit amount must equal the total credit amount.

For example, a transfer of ₦20,000 must produce:

| Entry              | Type     |  Amount |
| ------------------ | -------- | ------: |
| Source wallet      | `DEBIT`  | ₦20,000 |
| Destination wallet | `CREDIT` | ₦20,000 |

The total debits and credits must balance.

## 9. Core Data Requirements

The database must support the following entities:

| Entity         | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `User`         | Stores user details, credentials, role, and account status |
| `Wallet`       | Stores wallet ownership, balance, currency, and status     |
| `RefreshToken` | Supports authentication refresh-token handling             |
| `Transaction`  | Records the overall financial operation                    |
| `LedgerEntry`  | Records the debit or credit effect on a wallet             |

The database must maintain the relationships between these entities and use appropriate constraints, numeric types, and transactional operations to protect financial integrity.

The detailed schema and relationships are documented in `docs/database-design.md`.

## 10. API Requirements

The current API provides the following endpoints.

### Authentication

| Method | Endpoint                | Purpose                                  |
| ------ | ----------------------- | ---------------------------------------- |
| `POST` | `/api/v1/auth/register` | Register a user                          |
| `POST` | `/api/v1/auth/login`    | Authenticate a user                      |
| `POST` | `/api/v1/auth/refresh`  | Refresh authentication tokens            |
| `POST` | `/api/v1/auth/logout`   | Log out and invalidate the refresh token |

### Wallets and transfers

| Method | Endpoint                       | Purpose                                               |
| ------ | ------------------------------ | ----------------------------------------------------- |
| `GET`  | `/api/v1/wallets/me`           | Retrieve the authenticated user's wallet              |
| `POST` | `/api/v1/wallets/transfers`    | Transfer funds between wallets                        |
| `GET`  | `/api/v1/wallets/transactions` | Retrieve the authenticated user's transaction history |

### Administration

| Method  | Endpoint                         | Purpose                               |
| ------- | -------------------------------- | ------------------------------------- |
| `GET`   | `/api/v1/admin/users`            | List, search, and filter users        |
| `GET`   | `/api/v1/admin/users/:id`        | Retrieve an individual user's details |
| `PATCH` | `/api/v1/admin/users/:id/status` | Update a user's account status        |
| `GET`   | `/api/v1/admin/transactions`     | List and filter transactions          |

All administrative endpoints require authentication and administrator authorization.

## 11. Testing Requirements

The system must have automated tests covering critical functionality.

Required coverage includes:

- User registration and authentication.
- Access-token validation and account-status checks.
- Role-based access control.
- Wallet retrieval and ownership.
- Transfer validation.
- Insufficient-funds handling.
- Duplicate-transfer protection.
- Transaction and ledger consistency.
- Concurrent transfer safeguards.
- Transaction-history filtering and pagination.
- Administrative user and transaction operations.
- Safe administrative account-status changes.

Automated tests must be supplemented with database integration checks where necessary to verify PostgreSQL-specific behavior, transaction rollback, locking, and constraints.

## 12. Project Success Criteria

### What does success mean?

A user should be able to securely transfer funds to another user while maintaining a consistent financial ledger.

The project is successful when:

1. Users can register and authenticate securely.
2. Each user can access their own wallet.
3. Users can transfer funds to other users.
4. Transfers cannot create negative balances.
5. Duplicate requests do not unintentionally duplicate transfers.
6. Unauthorized users cannot initiate or inspect restricted financial operations.
7. Wallet balance changes, transaction records, and ledger entries remain consistent.
8. Failed transfers do not leave partial financial changes.
9. Concurrent operations preserve financial integrity.
10. Automated tests verify the critical financial and authorization rules.
11. Administrators can safely manage user accounts and inspect transaction activity.

## 13. Current Scope and Future Work

### Current scope

The project currently focuses on:

- Authentication and refresh-token handling.
- User and wallet management.
- Internal wallet-to-wallet transfers.
- Transaction history and filtering.
- Double-entry ledger records for transfers.
- Administrative user management and transaction views.
- Automated testing and financial-integrity safeguards.

### Future work

Potential future enhancements include:

- External deposit and withdrawal workflows.
- Payment-provider integrations.
- Payment webhook processing.
- Dedicated reconciliation and reporting tools.
- Persistent administrative audit logging.
- Rate limiting and additional operational controls.
- Production deployment and monitoring.

These items should be introduced as separate requirements when their implementation becomes part of the project's scope.

## 14. Guiding Principle

**Financial correctness takes priority over convenience or speed.**

Every financial operation must be authorized, validated, traceable, and consistent. The system must never sacrifice ledger integrity or wallet balance correctness to complete a transaction more quickly.
