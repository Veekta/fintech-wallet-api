# Security Documentation

## 1. Security Overview

Security is a core requirement of the Fintech Wallet & Ledger API because the application handles user accounts, authentication credentials, wallet balances, transfers, and financial records.

The current implementation focuses on:

- JWT-based authentication.
- Password hashing with Argon2.
- Refresh-token handling and rotation.
- Role-based authorization for administrative endpoints.
- User account-status enforcement.
- Wallet ownership and access control.
- Idempotent transfers.
- Atomic financial operations.
- Ledger entries for transfer debits and credits.
- Protection against insufficient funds and concurrent spending.
- Administrative safeguards for user account-status changes.
- Automated tests for important authentication, authorization, and financial scenarios.

This project is a learning implementation of a financial API. The controls documented here do not constitute a production security certification or guarantee that the application is ready for real-money operations.

## 2. Authentication

Authentication establishes the identity of the user making a request.

The application uses JWT-based access tokens and refresh tokens.

### Access tokens

Protected endpoints require an access token in the HTTP `Authorization` header.

```http
Authorization: Bearer <access-token>
```

The JWT authentication guard verifies the token and checks that it contains the expected user identifier and role claims.

Access tokens are configured with a 15-minute lifetime.

### Current account verification

A valid JWT alone is not sufficient to access protected endpoints. The authentication guard retrieves the current user from the database and verifies that the account exists and has an `ACTIVE` status.

The user's current role is taken from the database rather than trusted solely from the role claim in the token. This helps ensure that role changes take effect even when an older access token has not yet expired.

Requests are rejected when:

- The access token is missing.
- The token is invalid or expired.
- Required token claims are missing or invalid.
- The user no longer exists.
- The user's account is `SUSPENDED` or `DEACTIVATED`.
- The database lookup required for authentication fails.

### Refresh tokens

The authentication module supports refresh-token operations, including token rotation. Refresh operations validate the associated user's account status before issuing new authentication credentials.

Refresh tokens should be treated as sensitive credentials and must not be exposed in application logs or API responses beyond their intended authentication use.

## 3. Password Security

Passwords are hashed with Argon2 before being stored in the database.

During login, the application verifies the submitted password against the stored password hash.

The authentication flow is:

1. Receive the submitted credentials.
2. Locate the user account.
3. Verify the password against the stored Argon2 hash.
4. Reject invalid credentials.
5. Confirm the account is active.
6. Issue authentication tokens when the checks succeed.

Plaintext passwords must never be stored in the database.

Passwords and password hashes must not be unnecessarily exposed through API responses, logs, error messages, or source control. User-facing administrative responses must not expose the `passwordHash` field.

## 4. Authorization and Roles

Authentication establishes who is making a request. Authorization determines whether that user is permitted to perform the requested operation.

The application defines two user roles:

| Role    | Responsibility                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| `USER`  | Access permitted user-facing features, including the user's own wallet and authorized financial operations. |
| `ADMIN` | Access administrative endpoints for user management and transaction oversight.                              |

### Role-based access control

The application uses a `Roles` decorator to declare the roles permitted to access a route and a `RolesGuard` to enforce the requirement.

Administrative routes use both the JWT authentication guard and the role guard. A valid authenticated user without the `ADMIN` role receives a `403 Forbidden` response when attempting to access these routes.

Requests without valid authentication receive a `401 Unauthorized` response.

### Public registration

Public registration does not allow clients to choose their own role. The registration DTO accepts the permitted registration fields and does not expose the `role` field for user-controlled assignment.

Administrator accounts are created through a separate seed script rather than by allowing a public registration request to assign the `ADMIN` role.

## 5. User and Wallet Access Control

Users must only access resources permitted by their authenticated identity.

The wallet endpoint for the current user derives the user identity from the authenticated request rather than trusting a user identifier supplied by the client.

Transaction history is scoped to the authenticated user's wallet. This prevents a user from retrieving another user's transaction history merely by changing request parameters.

Administrative endpoints are separately protected by role-based authorization.

The backend is responsible for enforcing access control. Frontend restrictions alone are not sufficient.

Any new endpoint that accepts a user ID, wallet ID, or transaction ID must verify ownership or require an appropriate administrative permission before returning protected data or modifying a resource.

## 6. Financial Operation Security

Financial operations require stronger consistency guarantees than ordinary CRUD operations.

The current transfer implementation uses the authenticated user's wallet, validates the transfer request, checks available funds, and performs the related financial changes within a database transaction.

The intended transfer flow is:

1. Authenticate the requester.
2. Validate the request and idempotency key.
3. Identify the source wallet associated with the authenticated user.
4. Validate the transfer details and applicable business rules.
5. Check that sufficient funds are available.
6. Create or update the required transaction and wallet records.
7. Record the corresponding debit and credit ledger entries.
8. Commit the database transaction if the operation succeeds.

The exact checks and permitted states are determined by the implemented transfer service and database contract.

### Balance integrity

Clients must not be allowed to directly modify wallet balances through an unrestricted balance-update endpoint.

Balance changes must occur through controlled business operations. For transfers, the wallet changes and corresponding ledger records must be committed together.

Deposits and withdrawals are not currently integrated with a payment provider or external banking system. They must not be treated as completed real-money capabilities.

## 7. Input Validation and Financial Amounts

External input must be validated before it is used in business logic or database operations.

The application uses request DTOs and service-level checks for supported operations. Query filters and pagination parameters are also validated where implemented.

For financial amounts, the API must reject invalid values, including non-positive amounts where positive transfer amounts are required.

The database wallet balance and transaction amount fields use numeric decimal types rather than binary floating-point database fields. Monetary calculations should preserve decimal precision throughout the financial workflow.

Any future financial endpoint must validate:

- Required fields.
- Amounts and permitted precision.
- Source and destination identifiers.
- Supported transaction types and statuses.
- Pagination and filter values.
- Date ranges where applicable.
- Idempotency requirements.

Validation rules must be enforced on the server, even when the frontend performs equivalent checks.

## 8. Idempotency and Duplicate Transfers

The transfer endpoint supports an idempotency key so that retries of the same operation do not unintentionally create duplicate transfers.

This helps protect against duplicate submissions caused by network failures, timeouts, client retries, or repeated requests.

The application must preserve the relationship between an idempotency key and the operation it represents. Future changes must maintain appropriate uniqueness and transaction guarantees for idempotency handling.

Idempotency does not replace authentication, authorization, balance validation, or database transaction handling.

## 9. Database Transactions and Ledger Integrity

A financial transfer involves multiple related database changes, including the transaction record, wallet balances, and ledger entries.

These changes are executed within a database transaction so that they can succeed or fail as a unit.

Conceptually:

```text
BEGIN

Create transfer transaction
Debit source wallet
Credit destination wallet
Create debit ledger entry
Create credit ledger entry

COMMIT
```

If a required operation fails, the database transaction must roll back rather than leave a partially completed transfer.

For a successful transfer, the ledger records the debit and credit associated with the transaction. The transaction record represents the operation, while the ledger entries record the financial movements.

This separation supports traceability and future reconciliation.

## 10. Concurrency and Double-Spending Protection

Concurrent requests can create financial inconsistencies if multiple operations spend the same available balance.

The transfer implementation uses database-level transaction and locking safeguards to protect critical wallet operations. Automated tests cover important insufficient-funds and concurrent-transfer scenarios.

For example, if a wallet has ₦100,000, two concurrent transfers of ₦80,000 must not both succeed against that same available balance.

The key invariant is:

```text
Total successful debits
must not exceed available funds
```

Concurrency protection must remain enforced at the database and service layers. An application-level balance check performed without appropriate concurrency control is insufficient.

Changes to transfer logic, database locking, transaction boundaries, or ledger operations must be accompanied by regression tests.

## 11. User Account Status and Administrative Safeguards

The user model supports the following account statuses:

- `ACTIVE`
- `SUSPENDED`
- `DEACTIVATED`

The JWT guard checks the user's current status in the database for protected requests. Suspended and deactivated accounts cannot continue using protected endpoints simply because they possess an unexpired access token.

The administrative API supports user-status updates and validates the requested status.

Additional safeguards in the administrative status-update service include:

- Rejecting unsupported status values.
- Rejecting attempts by an administrator to suspend or deactivate their own account.
- Preventing suspension or deactivation of the last active administrator.
- Using database transaction and locking logic to coordinate sensitive status changes.

These safeguards are covered by service-level tests. The database locking implementation must be reviewed and verified against the actual PostgreSQL behavior before the application is considered production-ready.

## 12. Administrative API Security

The administrative API provides endpoints for:

- Listing users with supported filters and pagination.
- Retrieving a user's details.
- Updating user account status.
- Listing transactions with supported filters and pagination.

These routes are protected at the controller level by JWT authentication and the `ADMIN` role requirement.

Administrative responses must avoid exposing password hashes, refresh-token secrets, or other unnecessary sensitive fields.

Administrative operations that change account status should be reviewed for authorization, concurrency, and auditability. A complete persistent audit log for all administrative actions is not currently documented as implemented.

## 13. Error Handling

Errors returned to clients should provide enough information to explain the failure without exposing database credentials, internal infrastructure details, access tokens, or other secrets.

The application uses NestJS exceptions for expected authentication, authorization, validation, and resource-not-found failures.

Common HTTP status meanings include:

| Status                      | Meaning                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `400 Bad Request`           | The request or supplied parameters are invalid.                                           |
| `401 Unauthorized`          | Authentication is missing or invalid.                                                     |
| `403 Forbidden`             | The authenticated user lacks the required permission.                                     |
| `404 Not Found`             | The requested resource does not exist or cannot be found through the requested operation. |
| `500 Internal Server Error` | An unexpected server-side failure occurred.                                               |

Unexpected errors must not expose stack traces, SQL statements containing sensitive data, connection credentials, or internal infrastructure information to clients.

## 14. Secrets and Environment Configuration

Sensitive configuration must not be committed to source control.

Examples include:

- `DATABASE_URL`
- JWT signing secrets.
- Refresh-token signing secrets, if configured separately.
- Administrator seed credentials.
- External service credentials introduced in future integrations.

Development credentials should be supplied through local environment configuration. The repository may contain an `.env.example` file with placeholder values, but it must not contain actual credentials.

The administrator seed script must use environment-supplied credentials rather than hardcoded production secrets.

Before deployment, verify that real secrets are excluded from Git history and that production credentials are stored and managed using an appropriate secret-management process.

## 15. Database Security

The API uses PostgreSQL for application data and financial records.

Database credentials must be protected and must not be returned through API responses or written to logs.

For production deployment:

- Use a dedicated application database account.
- Grant only the database permissions the application requires.
- Restrict database network access.
- Do not expose the database publicly without a justified and controlled access design.
- Use separate databases and credentials for development, testing, and production.
- Back up important data and test the restoration process.
- Apply schema migrations through a controlled process.

These are deployment requirements and should not be interpreted as proof that production infrastructure has already been configured.

## 16. Logging and Auditability

The transaction and ledger models provide a foundation for tracing financial operations. Transaction records identify the operation, while ledger entries record the associated wallet movements.

For a financial system, logs and audit records should make it possible to investigate important events without exposing credentials or unnecessary personal information.

Sensitive values that must not be logged include:

- Plaintext passwords.
- Access tokens and refresh tokens.
- JWT signing secrets.
- Database credentials.
- External service secrets.

A comprehensive, persistent security audit system for login attempts, authentication failures, and every administrative action has not been established as part of the current implementation.

Before production use, define a structured audit strategy for important security and financial events, including retention, access restrictions, monitoring, and protection against unauthorized modification.

## 17. API and Transport Security

The API uses the global `/api/v1` route prefix.

Production deployment must provide HTTPS so credentials and financial requests are protected in transit. HTTPS termination, CORS allowlists, secure HTTP headers, request-size limits, and production network restrictions must be verified in the actual deployment configuration.

This document does not claim that rate limiting, a web application firewall, or all recommended HTTP security headers have already been configured.

Before exposing the API publicly, review these controls and add the missing protections appropriate to the deployment environment.

## 18. Rate Limiting and Abuse Prevention

Rate limiting is a recommended future security control for sensitive and public endpoints, particularly:

- Registration.
- Login.
- Refresh-token operations.
- Transfer requests.

Rate limiting is not documented as implemented in the current application.

Before production exposure, implement and test suitable limits to reduce brute-force attempts, credential stuffing, automated abuse, and excessive request traffic. The chosen solution should account for the deployment topology and, where necessary, use shared storage so that limits work across multiple application instances.

## 19. Dependency and Configuration Maintenance

The application depends on third-party packages for its runtime, authentication, database access, and testing.

Before release:

- Review dependency vulnerabilities.
- Update dependencies through a controlled process.
- Remove unused packages.
- Keep environment-specific configuration separate.
- Run the automated test suite after security-related changes.
- Review changes to authentication, authorization, database access, and financial operations.

A successful test run does not replace dependency auditing, deployment review, or independent security testing.

## 20. Security Testing

Security-related behavior is tested through automated unit and service tests.

The existing test coverage includes important scenarios involving:

### Authentication

- Missing, invalid, and expired access tokens.
- Missing or invalid token claims.
- Nonexistent users.
- Suspended and deactivated accounts.
- Database lookup failures during authentication.
- Current database roles overriding stale JWT role claims.

### Authorization

- Administrators accessing protected administrative routes.
- Regular users being denied administrative access.
- Unauthenticated requests being rejected.
- Role guard behavior when no role restriction is declared.

### Transfers and wallet operations

- Insufficient-funds scenarios.
- Duplicate-transfer protection.
- Transaction and ledger behavior.
- Concurrent transfer safeguards.
- Wallet-scoped transaction history.

### Administrative operations

- User listing and filtering.
- User detail retrieval.
- Account-status validation.
- Self-suspension and self-deactivation protection.
- Last-active-administrator protection.

These tests provide evidence for the specific scenarios they cover. They do not establish that every security risk has been addressed.

Before production use, add broader integration and security testing for rate limiting, malformed and oversized requests, dependency vulnerabilities, deployment configuration, and other controls that are not yet implemented or verified.

## 21. Current Scope and Known Limitations

The following capabilities are outside the current implementation scope or require further verification:

- Integration with real deposit and withdrawal providers.
- Multi-factor authentication.
- Transaction PINs or biometric confirmation.
- KYC verification and fraud detection.
- Transaction limits and suspicious-activity monitoring.
- Rate limiting.
- Comprehensive persistent security audit logging.
- Production HTTPS, CORS, HTTP-header, and network-security configuration.
- Dedicated production secret management.
- Independent penetration testing and formal security review.

The absence of these features should be considered when deciding how the API may safely be used.

## 22. Security Principles

The project follows these core principles:

1. Never store plaintext passwords.
2. Authenticate requests before allowing protected access.
3. Enforce authorization on the server.
4. Use the current account status and role when authorizing protected requests.
5. Prevent users from assigning themselves administrative privileges through public registration.
6. Scope user resources to the authenticated identity.
7. Treat transfers as atomic financial operations.
8. Protect against duplicate transfers and concurrent spending.
9. Maintain transaction and ledger consistency.
10. Keep secrets out of source control, logs, and API responses.
11. Fail safely when authentication or required database checks fail.
12. Test security-sensitive behavior when changing the implementation.
13. Distinguish implemented controls from planned protections.
14. Review the complete deployment environment before exposing the API to real users or real-money activity.

## 23. Future Security Improvements

As the API evolves, the following controls should be evaluated and implemented where appropriate:

- Rate limiting and brute-force protection.
- Multi-factor authentication.
- Session and device management.
- Transaction confirmation mechanisms.
- KYC and identity verification.
- Transaction limits and fraud monitoring.
- Structured security audit logging.
- Production secret management.
- HTTPS and hardened HTTP configuration.
- Automated dependency vulnerability scanning.
- Backup and disaster-recovery testing.
- Integration testing and independent security assessment.

These items are future improvements, not claims about existing functionality.
