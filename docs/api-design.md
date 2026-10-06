## 1. API Overview

The Fintech Wallet & Ledger API will expose a RESTful HTTP API for managing users, wallets, financial transactions, transfers, deposits, withdrawals, and administrative operations.

The API will use JSON for request and response bodies.

All API endpoints will be versioned under:

```text
/api/v1
```

Example:

```text
POST /api/v1/auth/login
```

---

## 2. API Design Principles

The API will follow these principles:

- Use RESTful resource naming where appropriate.
- Use HTTP methods according to their intended semantics.
- Use JSON for request and response bodies.
- Version the API.
- Validate all incoming data.
- Protect sensitive operations with authentication and authorization.
- Use consistent response and error formats.
- Never allow clients to directly manipulate financial balances.
- Represent financial operations as business operations rather than direct database updates.
- Use idempotency for operations that can create financial side effects.
- Return appropriate HTTP status codes.

---

## 3. Base URL

Development:

```text
http://localhost:3000/api/v1
```

Production:

```text
https://api.example.com/api/v1
```

The production URL will be configured when the application is deployed.

---

# 4. Authentication

Authentication endpoints are responsible for registering users and establishing authenticated sessions.

## 4.1 Register

```http
POST /api/v1/auth/register
```

### Request

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secure-password"
}
```

### Response

```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "USER",
    "status": "ACTIVE"
  },
  "accessToken": "access-token"
}
```

### Status Codes

```text
201 Created
400 Bad Request
409 Conflict
```

---

## 4.2 Login

```http
POST /api/v1/auth/login
```

### Request

```json
{
  "email": "john@example.com",
  "password": "secure-password"
}
```

### Response

```json
{
  "accessToken": "access-token",
  "refreshToken": "refresh-token"
}
```

### Status Codes

```text
200 OK
400 Bad Request
401 Unauthorized
```

---

## 4.3 Refresh Token

```http
POST /api/v1/auth/refresh
```

Used to obtain a new access token using a valid refresh token.

### Status Codes

```text
200 OK
401 Unauthorized
```

---

## 4.4 Logout

```http
POST /api/v1/auth/logout
```

Invalidates the user's authentication session or refresh token.

### Authentication

Required.

### Status Codes

```text
200 OK
401 Unauthorized
```

---

# 5. User API

## 5.1 Get Current User

```http
GET /api/v1/users/me
```

Returns information about the currently authenticated user.

### Authentication

Required.

### Response

```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "USER",
  "status": "ACTIVE"
}
```

### Status Codes

```text
200 OK
401 Unauthorized
```

The `/me` endpoint prevents clients from arbitrarily requesting another user's private account information.

---

# 6. Wallet API

## 6.1 Create Wallet

```http
POST /api/v1/wallets
```

Creates a wallet for the authenticated user.

### Authentication

Required.

### Request

```json
{
  "currency": "NGN"
}
```

### Response

```json
{
  "id": "wallet-uuid",
  "currency": "NGN",
  "balance": "0.00",
  "status": "ACTIVE"
}
```

### Status Codes

```text
201 Created
400 Bad Request
401 Unauthorized
409 Conflict
```

---

## 6.2 Get Current Wallet

```http
GET /api/v1/wallets/me
```

Returns the authenticated user's wallet.

### Authentication

Required.

### Response

```json
{
  "id": "wallet-uuid",
  "currency": "NGN",
  "balance": "100000.00",
  "status": "ACTIVE"
}
```

### Status Codes

```text
200 OK
401 Unauthorized
404 Not Found
```

---

# 7. Transfer API

Transfers represent the movement of funds from one wallet to another.

## 7.1 Create Transfer

```http
POST /api/v1/transfers
```

### Authentication

Required.

### Request

```http
Authorization: Bearer <access-token>
Idempotency-Key: unique-request-key
```

```json
{
  "recipientWalletId": "wallet-b-uuid",
  "amount": "20000.00",
  "currency": "NGN"
}
```

### Response

```json
{
  "id": "transaction-uuid",
  "type": "TRANSFER",
  "status": "COMPLETED",
  "amount": "20000.00",
  "currency": "NGN",
  "sourceWalletId": "wallet-a-uuid",
  "destinationWalletId": "wallet-b-uuid",
  "createdAt": "2026-10-06T10:00:00Z"
}
```

### Status Codes

```text
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
```

Possible business errors include:

```text
INSUFFICIENT_FUNDS
INVALID_RECIPIENT
SAME_SOURCE_AND_DESTINATION
WALLET_SUSPENDED
DUPLICATE_TRANSACTION
CURRENCY_MISMATCH
```

---

## 7.2 Transfer Rules

A transfer must satisfy the following rules:

1. The user must be authenticated.
2. The source wallet must belong to the authenticated user.
3. The destination wallet must exist.
4. The source and destination wallets must be different.
5. Both wallets must be active.
6. The amount must be greater than zero.
7. The source wallet must have sufficient available funds.
8. The source and destination currencies must match.
9. The transfer must be processed atomically.
10. A transfer must not be processed more than once.
11. A successful transfer must produce the appropriate ledger entries.

The client must never directly specify the resulting wallet balance.

---

# 8. Transaction API

Transactions represent the lifecycle and history of financial operations.

## 8.1 Get Transactions

```http
GET /api/v1/transactions
```

### Authentication

Required.

### Query Parameters

```text
?page=1
&limit=20
&type=TRANSFER
&status=COMPLETED
```

Example:

```http
GET /api/v1/transactions?page=1&limit=20&type=TRANSFER
```

### Response

```json
{
  "data": [
    {
      "id": "transaction-uuid",
      "type": "TRANSFER",
      "status": "COMPLETED",
      "amount": "20000.00",
      "currency": "NGN",
      "createdAt": "2026-10-06T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Users must only be able to retrieve transactions they are authorized to access.

---

## 8.2 Get Transaction

```http
GET /api/v1/transactions/:id
```

Example:

```http
GET /api/v1/transactions/transaction-uuid
```

### Authentication

Required.

### Status Codes

```text
200 OK
401 Unauthorized
403 Forbidden
404 Not Found
```

---

# 9. Deposit API

For the initial version of the project, deposits will be simulated.

A production implementation would integrate with an external payment provider and confirm deposits using trusted payment events or webhooks.

## 9.1 Create Deposit

```http
POST /api/v1/deposits
```

### Authentication

Required.

### Request

```json
{
  "amount": "50000.00",
  "currency": "NGN"
}
```

### Response

```json
{
  "id": "transaction-uuid",
  "type": "DEPOSIT",
  "status": "COMPLETED",
  "amount": "50000.00",
  "currency": "NGN"
}
```

### Status Codes

```text
201 Created
400 Bad Request
401 Unauthorized
422 Unprocessable Entity
```

The API must not allow clients to use deposits as an arbitrary mechanism for creating money in a production system.

---

# 10. Withdrawal API

## 10.1 Create Withdrawal

```http
POST /api/v1/withdrawals
```

### Authentication

Required.

### Request

```json
{
  "amount": "10000.00",
  "currency": "NGN"
}
```

### Response

```json
{
  "id": "transaction-uuid",
  "type": "WITHDRAWAL",
  "status": "COMPLETED",
  "amount": "10000.00",
  "currency": "NGN"
}
```

### Status Codes

```text
201 Created
400 Bad Request
401 Unauthorized
422 Unprocessable Entity
```

The system must verify that the wallet has sufficient available funds before processing a withdrawal.

---

# 11. Admin API

Administrative endpoints require:

1. Authentication
2. Administrator authorization

## 11.1 List Users

```http
GET /api/v1/admin/users
```

---

## 11.2 Get User

```http
GET /api/v1/admin/users/:id
```

---

## 11.3 Update User Status

```http
PATCH /api/v1/admin/users/:id/status
```

Example request:

```json
{
  "status": "SUSPENDED"
}
```

---

## 11.4 List Wallets

```http
GET /api/v1/admin/wallets
```

---

## 11.5 Get Wallet

```http
GET /api/v1/admin/wallets/:id
```

---

## 11.6 List Transactions

```http
GET /api/v1/admin/transactions
```

---

## 11.7 Get Transaction

```http
GET /api/v1/admin/transactions/:id
```

Administrative APIs must not allow administrators to arbitrarily modify financial records.

Financial records should remain auditable.

---

# 12. Authentication Model

Protected endpoints will use bearer-token authentication.

Example:

```http
Authorization: Bearer <access-token>
```

The request flow is:

```text
Client
   │
   │ Bearer Token
   ▼
Authentication Guard
   │
   ├── Invalid → 401
   │
   └── Valid
        │
        ▼
   Authorization
        │
        ├── Insufficient permission → 403
        │
        └── Authorized
               │
               ▼
           Controller
```

Authentication determines:

> Who are you?

Authorization determines:

> Are you allowed to perform this operation?

---

# 13. HTTP Status Codes

The API will use conventional HTTP status codes.

| Status | Meaning                                       |
| ------ | --------------------------------------------- |
| 200    | Request completed successfully                |
| 201    | Resource or operation created                 |
| 400    | Invalid request                               |
| 401    | Authentication required or invalid            |
| 403    | Authenticated but not authorized              |
| 404    | Resource not found                            |
| 409    | Request conflicts with existing state         |
| 422    | Request is valid but violates a business rule |
| 429    | Rate limit exceeded                           |
| 500    | Unexpected server error                       |

---

# 14. Error Response Format

The API will use a consistent error structure.

Example:

```json
{
  "statusCode": 422,
  "code": "INSUFFICIENT_FUNDS",
  "message": "Insufficient wallet balance",
  "errors": [],
  "timestamp": "2026-10-06T12:00:00Z",
  "path": "/api/v1/transfers"
}
```

Validation errors may contain field-level details:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request",
  "errors": [
    {
      "field": "amount",
      "message": "Amount must be greater than zero"
    }
  ],
  "timestamp": "2026-10-06T12:00:00Z",
  "path": "/api/v1/transfers"
}
```

---

# 15. Pagination

Collection endpoints will use pagination.

Example:

```http
GET /api/v1/transactions?page=1&limit=20
```

The response will contain:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

The API should enforce a maximum page size to prevent clients from requesting excessive amounts of data.

---

# 16. Idempotency

Financial operations must support idempotency.

A client may send an idempotency key:

```http
Idempotency-Key: 7c4e8d2f-...
```

For example:

```http
POST /api/v1/transfers
Idempotency-Key: 7c4e8d2f-...
```

If the same operation is accidentally submitted multiple times with the same idempotency key, the system should not create multiple transfers.

Conceptually:

```text
Request
   │
   ▼
Idempotency Key
   │
   ├── New
   │    ↓
   │  Process operation
   │    ↓
   │  Store result
   │
   └── Existing
        ↓
      Return original result
```

This protects against duplicate financial operations caused by:

- Network retries
- Client retries
- Timeout responses
- Duplicate requests

---

# 17. Financial Operation Principle

Clients must request financial operations rather than directly manipulating financial state.

Bad:

```http
PATCH /api/v1/wallets/:id
```

```json
{
  "balance": "80000"
}
```

The client should never determine the resulting balance.

Instead:

```http
POST /api/v1/transfers
```

```json
{
  "recipientWalletId": "wallet-b",
  "amount": "20000.00",
  "currency": "NGN"
}
```

The backend determines the appropriate financial changes.

This ensures that financial business rules remain inside the backend.

---

# 18. API Versioning

All initial endpoints will use:

```text
/api/v1
```

Example:

```text
/api/v1/auth/login
/api/v1/wallets/me
/api/v1/transfers
/api/v1/transactions
```

Breaking API changes can be introduced under a future version:

```text
/api/v2
```

without immediately breaking clients using `/api/v1`.

---

# 19. Initial API Map

```text
AUTH

POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout


USERS

GET    /api/v1/users/me


WALLETS

POST   /api/v1/wallets
GET    /api/v1/wallets/me


TRANSFERS

POST   /api/v1/transfers


TRANSACTIONS

GET    /api/v1/transactions
GET    /api/v1/transactions/:id


DEPOSITS

POST   /api/v1/deposits


WITHDRAWALS

POST   /api/v1/withdrawals


ADMIN

GET    /api/v1/admin/users
GET    /api/v1/admin/users/:id
PATCH  /api/v1/admin/users/:id/status

GET    /api/v1/admin/wallets
GET    /api/v1/admin/wallets/:id

GET    /api/v1/admin/transactions
GET    /api/v1/admin/transactions/:id
```

---

# 20. Future API Considerations

Future versions may introduce endpoints for:

- Payment provider webhooks
- Beneficiaries
- Bank account management
- KYC
- Statements
- Notifications
- Currency exchange
- Multi-currency wallets
- Transaction reconciliation
- Audit logs

These features are outside the initial MVP scope.
