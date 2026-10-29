# Fintech Wallet & Ledger API — API Design

## 1. API Overview

The Fintech Wallet & Ledger API is a RESTful HTTP API built with NestJS, TypeScript, and PostgreSQL. It provides authentication, wallet access, wallet-to-wallet transfers, transaction history, and administrative user and transaction management.

The API currently focuses on secure wallet operations and financial record consistency. External payment integrations, deposits, and withdrawals are outside the implemented scope.

### API conventions

- **Protocol:** HTTP; production deployment should use HTTPS.
- **Data format:** JSON for request and response bodies.
- **Version prefix:** `/api/v1`
- **Authentication:** JWT bearer access tokens for protected endpoints.
- **Authorization:** Role-based access control for administrative endpoints.
- **Financial integrity:** Database transactions, ledger entries, and idempotency for transfers.

## 2. Base URL

Development:

```text
http://localhost:3000/api/v1
```

Production URL will depend on the deployment environment.

All endpoint paths in this document are relative to the base URL unless the complete path is shown.

## 3. API Design Principles

The API follows these principles:

1. Use clear, resource-oriented endpoint names.
2. Use HTTP methods according to their intended semantics.
3. Validate incoming data on the server.
4. Authenticate protected requests.
5. Enforce authorization independently of the frontend.
6. Never allow clients to directly set wallet balances.
7. Process financial operations atomically.
8. Use idempotency to protect transfers against duplicate processing.
9. Keep transaction records and ledger entries consistent.
10. Return appropriate HTTP status codes.
11. Document implemented behavior separately from planned functionality.

## 4. Authentication API

Authentication endpoints are responsible for account registration, login, token refresh, and logout.

### 4.1 Register

**Endpoint**

```http
POST /api/v1/auth/register
```

Creates a user account and its associated default NGN wallet.

**Request body**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "your-password"
}
```

The accepted fields are determined by the registration DTO. Public registration does not allow the client to assign the `ADMIN` role.

**Expected behavior**

- Validate the registration input.
- Hash the password using Argon2.
- Create the user and wallet within the registration transaction.
- Roll back the operation if the transaction fails.

**Response**

The response contains the created user's permitted public fields and the access token. The password hash and other sensitive internal fields must not be returned.

**Relevant status codes**

- `201 Created` — Registration succeeded.
- `400 Bad Request` — Invalid input.
- `409 Conflict` — A conflicting account already exists, where handled by the implementation.

### 4.2 Login

**Endpoint**

```http
POST /api/v1/auth/login
```

Authenticates a user using their registered email and password.

**Request body**

```json
{
  "email": "john@example.com",
  "password": "your-password"
}
```

**Expected behavior**

1. Locate the account.
2. Verify the submitted password against the Argon2 hash.
3. Confirm that the account is active.
4. Issue authentication credentials when the checks succeed.

The access token has a configured lifetime of 15 minutes. The authentication implementation also supports refresh-token handling.

**Relevant status codes**

- `200 OK` — Login succeeded.
- `400 Bad Request` — Invalid request input.
- `401 Unauthorized` — Invalid credentials or unavailable account, as applicable.

### 4.3 Refresh Token

**Endpoint**

```http
POST /api/v1/auth/refresh
```

Uses a valid refresh token to obtain a new access token.

The implementation supports refresh-token rotation and checks the associated user's account status.

The refresh-token transport and cookie attributes should follow the actual authentication controller configuration. Clients should not assume a cookie name or cookie policy beyond what the deployed implementation specifies.

**Relevant status code**

- `200 OK` — Refresh succeeded.
- `401 Unauthorized` — Missing, invalid, expired, or otherwise unusable refresh credentials.

### 4.4 Logout

**Endpoint**

```http
POST /api/v1/auth/logout
```

Revokes the refresh-token session using the refresh-token mechanism supported by the authentication implementation.

Logout is designed to invalidate the refresh session so it cannot be used to obtain further access tokens.

The exact response and behavior when the refresh token is missing or invalid should be confirmed against the current controller.

## 5. Wallet API

### 5.1 Get Current Wallet

**Endpoint**

```http
GET /api/v1/wallets/me
```

**Authentication:** Required.

Returns the wallet associated with the authenticated user.

The user identity is derived from the authenticated request rather than supplied as an arbitrary user ID by the client.

**Illustrative response**

```json
{
  "id": "wallet-uuid",
  "currency": "NGN",
  "balance": "100000.00",
  "status": "ACTIVE"
}
```

The values above illustrate the response fields; the balance and identifiers will reflect the actual account.

**Relevant status codes**

- `200 OK` — Wallet retrieved.
- `401 Unauthorized` — Authentication is missing or invalid.
- `404 Not Found` — No associated wallet was found.

### Wallet rules

- A user's wallet must be associated with the correct user account.
- Clients cannot directly set the wallet balance.
- Financial balance changes must occur through controlled business operations.
- Wallet access must be enforced by the backend.

## 6. Transfer API

### 6.1 Create Transfer

**Endpoint**

```http
POST /api/v1/wallets/transfers
```

**Authentication:** Required.

Transfers move funds from the authenticated user's wallet to a recipient wallet.

**Headers**

```http
Authorization: Bearer <access-token>
Idempotency-Key: unique-request-key
Content-Type: application/json
```

**Request body**

```json
{
  "recipientWalletId": "recipient-wallet-uuid",
  "amount": "20000.00",
  "currency": "NGN"
}
```

The request must follow the implemented transfer DTO and validation rules.

**Illustrative response**

```json
{
  "id": "transaction-uuid",
  "type": "TRANSFER",
  "status": "COMPLETED",
  "amount": "20000.00",
  "currency": "NGN",
  "sourceWalletId": "source-wallet-uuid",
  "destinationWalletId": "recipient-wallet-uuid",
  "createdAt": "2026-10-29T10:00:00Z"
}
```

The response illustrates the transfer record's core fields. The actual response is determined by the transfer service.

### 6.2 Transfer processing

A transfer must follow the implemented business rules and database safeguards.

The high-level flow is:

1. Authenticate the requester.
2. Validate the transfer input.
3. Identify the source wallet associated with the authenticated user.
4. Validate the recipient and transfer conditions.
5. Check available funds.
6. Apply the required wallet and transaction changes atomically.
7. Record the debit and credit ledger entries.
8. Commit the operation if all required steps succeed.

### 6.3 Transfer rules

The transfer implementation protects against important financial inconsistencies:

- Unauthorized use of another user's source wallet.
- Invalid transfer amounts.
- Insufficient available funds.
- Duplicate transfer processing through idempotency.
- Partial financial updates through database transaction handling.
- Inconsistent transaction and ledger records.
- Concurrent transfers spending the same available funds.

The source and destination must satisfy the business rules enforced by the service. Clients must never supply the resulting wallet balance.

### 6.4 Idempotency

Transfers accept an `Idempotency-Key` header.

The key identifies a transfer request so that retries do not unintentionally create duplicate transfers.

Clients should reuse the same key when retrying the same logical operation and use a new key for a genuinely new transfer.

Idempotency is not a replacement for authorization, amount validation, or transaction safety.

### 6.5 Relevant status codes

The exact mapping depends on the exceptions returned by the implementation. Relevant HTTP outcomes include:

- `201 Created` — Transfer created successfully.
- `400 Bad Request` — Invalid request input.
- `401 Unauthorized` — Missing or invalid authentication.
- `403 Forbidden` — Authenticated user lacks permission, where applicable.
- `404 Not Found` — A required resource could not be found.
- `409 Conflict` — A duplicate or conflicting operation, where handled.
- `422 Unprocessable Entity` — A business-rule violation, where mapped to this status.

These are potential outcomes, not a guarantee that every listed status is currently returned for every corresponding error.

## 7. Transaction History API

### 7.1 Get Current User's Transactions

**Endpoint**

```http
GET /api/v1/wallets/transactions
```

**Authentication:** Required.

Returns transaction history associated with the authenticated user's wallet.

The endpoint is wallet-scoped. A user must not be able to access another user's transaction history by changing query parameters.

### 7.2 Query parameters

The implemented transaction-history endpoint supports the following filters:

| Parameter   | Purpose                                    |
| ----------- | ------------------------------------------ |
| `page`      | Requested page number                      |
| `limit`     | Number of records requested per page       |
| `type`      | Filter by transaction type                 |
| `status`    | Filter by transaction status               |
| `startDate` | Filter transactions from a starting date   |
| `endDate`   | Filter transactions through an ending date |

Supported transaction types include `TRANSFER`, `DEPOSIT`, and `WITHDRAWAL`, according to the database enum. This does not mean deposit and withdrawal endpoints are implemented.

Supported transaction statuses include `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, and `REVERSED`.

**Example**

```http
GET /api/v1/wallets/transactions?page=1&limit=20&type=TRANSFER&status=COMPLETED
```

Date-filter example:

```http
GET /api/v1/wallets/transactions?startDate=2026-10-01&endDate=2026-10-29
```

The implementation validates the date range and applies the supported filters. Results are ordered newest first and returned with pagination metadata.

### 7.3 Illustrative response

```json
{
  "data": [
    {
      "id": "transaction-uuid",
      "type": "TRANSFER",
      "status": "COMPLETED",
      "amount": "20000.00",
      "currency": "NGN",
      "createdAt": "2026-10-29T10:00:00Z"
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

The example illustrates the general response structure. The precise fields returned for each transaction must match the service's selected fields.

### 7.4 Relevant status codes

- `200 OK` — Transaction history retrieved.
- `400 Bad Request` — Invalid filter, pagination, or date range.
- `401 Unauthorized` — Authentication is missing or invalid.
- `404 Not Found` — The user has no associated wallet, where handled as a not-found condition.

A separate user-facing `GET /api/v1/transactions/:id` endpoint is not included in the current documented implementation.

## 8. Administrative API

Administrative endpoints require authentication and the `ADMIN` role.

The controller applies the JWT authentication guard and role guard to administrative routes. Ordinary users are denied access.

### 8.1 List Users

**Endpoint**

```http
GET /api/v1/admin/users
```

Returns a paginated list of users with supported filters.

**Query parameters**

| Parameter | Purpose                      |
| --------- | ---------------------------- |
| `page`    | Requested page               |
| `limit`   | Page size                    |
| `search`  | Search supported user fields |
| `role`    | Filter by `USER` or `ADMIN`  |
| `status`  | Filter by account status     |

Supported account statuses are `ACTIVE`, `SUSPENDED`, and `DEACTIVATED`.

**Example**

```http
GET /api/v1/admin/users?page=1&limit=20&role=USER&status=ACTIVE
```

The service validates the supported role and status filters and returns pagination metadata.

### 8.2 Get User Details

**Endpoint**

```http
GET /api/v1/admin/users/:id
```

Retrieves the details of a specified user, including associated wallet information where available.

**Example**

```http
GET /api/v1/admin/users/user-uuid
```

Administrative responses must not expose password hashes or refresh-token secrets.

**Relevant status codes**

- `200 OK` — User retrieved.
- `401 Unauthorized` — Authentication is missing or invalid.
- `403 Forbidden` — User does not have the `ADMIN` role.
- `404 Not Found` — User does not exist.

### 8.3 Update User Status

**Endpoint**

```http
PATCH /api/v1/admin/users/:id/status
```

Updates the status of a user account.

**Request body**

```json
{
  "status": "SUSPENDED"
}
```

Supported status values:

- `ACTIVE`
- `SUSPENDED`
- `DEACTIVATED`

The service includes safeguards against invalid status values, self-suspension or self-deactivation by the acting administrator, and suspension or deactivation of the last active administrator.

Sensitive status changes use database transaction and locking logic to coordinate the operation.

**Relevant status codes**

- `200 OK` — Status updated.
- `400 Bad Request` — Unsupported status value or invalid request.
- `401 Unauthorized` — Authentication is missing or invalid.
- `403 Forbidden` — User is not an administrator or the requested action is prohibited.
- `404 Not Found` — Target user does not exist.

The precise exception-to-status mapping should be kept consistent with the controller and service implementation.

### 8.4 List Transactions

**Endpoint**

```http
GET /api/v1/admin/transactions
```

Returns a paginated administrative view of transactions.

**Query parameters**

| Parameter   | Purpose                      |
| ----------- | ---------------------------- |
| `page`      | Requested page               |
| `limit`     | Page size                    |
| `type`      | Filter by transaction type   |
| `status`    | Filter by transaction status |
| `startDate` | Filter by starting date      |
| `endDate`   | Filter by ending date        |

**Example**

```http
GET /api/v1/admin/transactions?page=1&limit=20&type=TRANSFER&status=COMPLETED
```

The service supports the documented filters, validates date ranges, and returns pagination metadata.

**Relevant status codes**

- `200 OK` — Transactions retrieved.
- `400 Bad Request` — Invalid filters or date range.
- `401 Unauthorized` — Authentication is missing or invalid.
- `403 Forbidden` — User does not have the `ADMIN` role.

### 8.5 Administrative endpoint restrictions

The following endpoints are **not included in the currently documented implementation**:

```text
GET /api/v1/admin/wallets
GET /api/v1/admin/wallets/:id
GET /api/v1/admin/transactions/:id
```

They should not be treated as available API operations unless implemented and verified in the corresponding controllers and services.

Administrative access does not grant permission to arbitrarily modify financial records. Financial transaction and ledger integrity must be preserved.

## 9. HTTP Status Codes

The API uses conventional HTTP status codes where supported by the implementation.

| Status                      | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `200 OK`                    | Request completed successfully                              |
| `201 Created`               | A resource or operation was created                         |
| `400 Bad Request`           | Request input or parameters are invalid                     |
| `401 Unauthorized`          | Authentication is missing or invalid                        |
| `403 Forbidden`             | Authenticated user lacks permission                         |
| `404 Not Found`             | Requested resource was not found                            |
| `409 Conflict`              | Request conflicts with existing state, where handled        |
| `422 Unprocessable Entity`  | Business-rule violation, where mapped by the implementation |
| `500 Internal Server Error` | Unexpected server-side failure                              |

`429 Too Many Requests` is not documented as an implemented rate-limiting response because rate limiting is outside the verified current scope.

The actual HTTP status returned for an error is determined by the relevant NestJS exception and exception-handling configuration.

## 10. Error Handling

The API uses NestJS exception handling for expected failures, including authentication, authorization, invalid input, and missing resources.

Error response shapes must match the actual response generated by the application.

The following is an illustrative example of a possible business error, not a guarantee of the current response schema:

```json
{
  "statusCode": 400,
  "message": "Invalid request"
}
```

Do not assume that a custom response containing `code`, `errors`, `timestamp`, and `path` is implemented unless a global exception filter or equivalent mechanism explicitly provides it.

Errors returned to clients must not disclose database credentials, JWT secrets, password hashes, stack traces, or other sensitive implementation details.

## 11. Pagination and Filtering

Collection endpoints use pagination where implemented.

The general query pattern is:

```http
?page=1&limit=20
```

Responses include a data collection and pagination metadata, such as the requested page, page size, total records, and total pages.

Filtering differs by endpoint:

- **User transaction history:** page, limit, type, status, start date, and end date.
- **Administrative user listing:** page, limit, search, role, and account status.
- **Administrative transaction listing:** page, limit, type, status, start date, and end date.

Clients should use only the filters supported by the specific endpoint.

Pagination defaults, maximum page size, and invalid-parameter behavior must match the current service implementation.

## 12. Authentication and Authorization Flow

Protected requests follow this general flow:

```text
Client Request
      |
      v
JWT Authentication Guard
      |
      +-- Missing/invalid token --> 401
      |
      v
Load Current User
      |
      +-- User missing or inactive --> 401
      |
      v
Role Authorization (when required)
      |
      +-- Insufficient role --> 403
      |
      v
Controller and Service
      |
      v
Business Rules and Database Operations
```

The JWT guard verifies the token and checks the current user record. The role guard enforces role requirements on administrative routes.

Authentication and authorization are enforced on the backend and are not delegated to the frontend.

## 13. Financial Operation Principles

Clients request financial operations; they do not determine the resulting financial state.

A transfer request identifies the recipient and amount. The backend determines the source wallet from the authenticated user and applies the financial business rules.

The implementation uses a transaction record to represent the transfer and ledger entries to record the associated debit and credit.

A successful transfer must not leave wallet balances and ledger records inconsistent.

The database transaction, idempotency, and concurrency safeguards are central to maintaining this invariant.

## 14. API Versioning

The current API uses the version prefix:

```text
/api/v1
```

Examples:

```text
/api/v1/auth/login
/api/v1/wallets/me
/api/v1/wallets/transfers
/api/v1/wallets/transactions
/api/v1/admin/users
/api/v1/admin/transactions
```

Future breaking changes may be introduced under a new version such as `/api/v2` when required. Existing clients should not be moved to a new version without a deliberate compatibility plan.

## 15. Current API Map

The following map reflects the endpoints documented for the current implementation.

### Authentication

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
```

### Wallets and transfers

```text
GET    /api/v1/wallets/me
POST   /api/v1/wallets/transfers
GET    /api/v1/wallets/transactions
```

### Administration

```text
GET    /api/v1/admin/users
GET    /api/v1/admin/users/:id
PATCH  /api/v1/admin/users/:id/status
GET    /api/v1/admin/transactions
```

The map excludes planned endpoints that have not been verified as implemented.

## 16. Future API Considerations

The following features are outside the current implemented scope and may be considered in future iterations:

- Deposit and withdrawal operations.
- Payment provider integrations and trusted payment webhooks.
- Bank account management.
- Beneficiaries.
- KYC and identity verification.
- Statements and downloadable transaction reports.
- Notifications.
- Multi-currency wallets and currency exchange.
- Transaction reconciliation tools.
- Dedicated audit-log endpoints.
- Administrative wallet details and individual transaction retrieval endpoints.
- Additional rate limiting and abuse-prevention controls.

These features must be designed, implemented, tested, and documented before they are presented to API consumers as available functionality.

## 17. Maintaining This Document

This document is intended to describe the API contract, not merely the intended architecture.

Whenever an endpoint, DTO, response schema, authentication mechanism, business rule, or HTTP status mapping changes:

1. Update the relevant section of this document.
2. Verify request and response examples against the implementation.
3. Add or update automated tests.
4. Confirm that the documented endpoint map matches the controllers.
5. Clearly mark functionality that remains planned or unverified.

The implementation is the source of truth for available API behavior. Documentation must not advertise an endpoint or security guarantee that the application does not provide.
