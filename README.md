# Fintech Wallet API

A backend financial wallet API built with **NestJS, TypeScript, PostgreSQL, Docker, and Prisma 8**.

The project focuses on the engineering principles behind reliable financial systems, including transactional integrity, concurrency control, idempotency, authentication, authorization, wallet transfers, ledger entries, security, and automated testing.

The application follows a **modular monolith architecture**, prioritizing correctness, maintainability, and clear business boundaries before introducing distributed-system complexity.

> **Project status:** Core wallet functionality, authentication, transaction history, and administrative APIs have been implemented. This is a backend engineering and learning project; it has not been certified or independently audited for production financial use.

---

## Table of Contents

- [Overview](#overview)
- [Implemented Features](#implemented-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Prisma Workflow](#prisma-workflow)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Authentication and Authorization](#authentication-and-authorization)
- [Financial Integrity](#financial-integrity)
- [Testing](#testing)
- [Documentation](#documentation)
- [Known Scope and Limitations](#known-scope-and-limitations)
- [Development Workflow](#development-workflow)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

The Fintech Wallet API provides backend functionality for users to authenticate, access their wallets, transfer funds between wallets, and inspect their transaction history. Administrators can manage user accounts and inspect financial transactions.

The project is designed around financial invariants:

- Money must not disappear or be created unintentionally.
- Wallet balances must not become negative through an invalid transfer.
- Unauthorized users must not move funds.
- A financial operation must not partially complete.
- Duplicate requests must not create duplicate financial effects.
- Every completed transfer must have corresponding financial records.
- Wallet balances and transaction records must remain consistent.
- Administrative actions must respect account permissions and safeguards.

These requirements make the project more than a conventional CRUD API. Database transactions, concurrency, authorization, and financial records are treated as core parts of the design.

---

## Implemented Features

### 1. Authentication and identity

- User registration and login.
- Password hashing and verification using Argon2.
- JWT-based authentication.
- Refresh-token rotation.
- Logout and refresh-token management.
- Authentication guard for protected routes.
- Database-backed checks of the current user's existence, status, and role.
- Rejection of suspended, deactivated, or nonexistent accounts.
- Public registration does not allow users to assign themselves the administrator role.

### 2. Wallet management

- Wallet creation during user registration.
- Authenticated users can retrieve their own wallet.
- Wallet ownership is enforced for wallet-specific operations.
- Wallet balances and currency are represented in the database.

### 3. Wallet transfers

- Transfers between wallets.
- Input validation and amount normalization.
- Idempotency-key validation and duplicate-request protection.
- Transaction-safe updates to source and destination balances.
- Balance validation and insufficient-funds handling.
- Financial transaction records.
- Debit and credit ledger entries.
- Concurrency safeguards for financial operations.

### 4. Transaction history

- Authenticated transaction history.
- Pagination.
- Filtering by transaction type and status.
- Date-range filtering.
- Wallet-scoped transaction retrieval.

### 5. Administrative API

- List users with pagination.
- Search users and filter by role or account status.
- Retrieve user details and associated wallet information.
- Change user account status.
- List financial transactions with filters and pagination.
- Role-based access control for administrative endpoints.
- Protection against suspending or deactivating the acting administrator.
- Protection against suspending or deactivating the last active administrator.

### 6. Automated testing

The project uses Vitest for unit testing. Tests cover authentication, guards, wallet operations, transfer behavior, transaction history, DTO validation, and administrative functionality.

The latest recorded verification completed successfully with **93 passing tests across 17 test files**, followed by a successful NestJS production build. Rerun the commands in the Testing section to verify the current state of the repository.

---

## Architecture

The application follows a **modular monolith architecture**.

```text
Client
  |
  v
HTTP / REST API
  |
  v
NestJS Controllers
  |
  v
Application Services
  |
  v
Business Rules and Authorization
  |
  v
Database Access Layer
  |
  v
Prisma 8 Contract-Based Workflow
  |
  v
PostgreSQL
```

The application is organized around business responsibilities rather than technical layers alone.

### Implemented modules and responsibilities

| Area           | Responsibility                                                       |
| -------------- | -------------------------------------------------------------------- |
| Auth           | Registration, login, token management, and authentication            |
| Users          | User identity and database-backed user lookup                        |
| Wallets        | Wallet access and transfer-related endpoints                         |
| Transactions   | Transaction history and financial transaction records                |
| Admin          | User management, account-status controls, and transaction inspection |
| Ledger records | Debit and credit entries associated with transfers                   |

The ledger records are implemented as part of the financial transfer workflow. This does not imply that there is a separate standalone NestJS Ledger module.

Infrastructure concerns such as database access, input validation, authentication, and authorization are separated from business responsibilities.

See [docs/architecture.md](docs/architecture.md) for the detailed architecture.

---

## Technology Stack

| Technology     | Purpose                                          |
| -------------- | ------------------------------------------------ |
| TypeScript     | Application language                             |
| NestJS         | Backend framework                                |
| Node.js        | JavaScript runtime                               |
| PostgreSQL     | Relational database                              |
| Prisma 8       | Contract-based database workflow and data access |
| Docker Compose | Local database infrastructure                    |
| Vitest         | Automated testing                                |
| Argon2         | Password hashing and verification                |
| JWT            | Access-token authentication                      |
| Git            | Version control                                  |
| GitHub         | Remote repository and collaboration              |

Redis, BullMQ, observability tooling, CI/CD, and cloud deployment remain potential future additions rather than prerequisites for the current implementation.

---

## Repository Structure

The principal project files and directories include:

```text
fintech-wallet-api/
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── database-design.md
│   ├── api-design.md
│   └── security.md
│
├── migrations/
│   ├── app/
│   ├── refs/
│   └── snapshots/
│
├── scripts/
│   └── seed-admin.ts
│
├── src/
│   ├── admin/
│   │   ├── dto/
│   │   ├── admin.controller.ts
│   │   ├── admin.controller.spec.ts
│   │   ├── admin.module.ts
│   │   ├── admin.service.ts
│   │   └── admin.service.spec.ts
│   │
│   ├── auth/
│   │   ├── decorators/
│   │   ├── guards/
│   │   └── services/
│   │
│   ├── users/
│   ├── wallets/
│   ├── prisma/
│   │   ├── contract.prisma
│   │   ├── contract.json
│   │   ├── contract.d.ts
│   │   └── db.ts
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── test/
├── .env.example
├── docker-compose.yml
├── package.json
├── prisma.config.ts
├── tsconfig.json
├── vitest.config.ts
└── vitest.config.e2e.ts
```

This is a representative structure; individual source directories contain additional files and tests.

---

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm.
- Docker Desktop with Docker Compose.
- Git.

Verify the installations:

```bash
node --version
npm --version
docker --version
docker compose version
git --version
```

### 1. Clone the repository

```bash
git clone <repository-url>
cd fintech-wallet-api
```

Replace `<repository-url>` with the actual GitHub repository URL.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the environment

Create your local environment file:

```bash
cp .env.example .env
```

Open `.env` and provide the required configuration values before starting the application.

Never commit your real `.env` file, database credentials, JWT secrets, or administrator password.

---

## Environment Configuration

The project uses environment variables for database connectivity, authentication, and local development.

The README's example configuration is:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://wallet_user:wallet_password@localhost:5433/wallet_db

JWT_SECRET=
JWT_REFRESH_SECRET=

REDIS_URL=
```

Use the variable names expected by the actual application and `.env.example`. Supply strong, unique JWT secrets before using authentication. Do not copy example credentials into a deployed environment.

Redis is not required for the core wallet functionality described here.

### Administrator seeding

The administrative seed script requires these environment variables:

```env
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_NAME=
```

The password must contain at least 12 characters.

The script checks for an existing account with the supplied email, hashes the password using Argon2, and creates the administrator and wallet in a database transaction. It refuses to create a duplicate account.

After configuring the variables, build the project before running the seed script because it imports the compiled database module.

```bash
npm run build
node --experimental-strip-types scripts/seed-admin.ts
```

Run the script only against the intended database. Use a strong, unique administrator password and never share it or commit it to Git.

---

## Database Setup

PostgreSQL is provided through Docker Compose.

### Start the database

```bash
docker compose up -d
```

Check running containers:

```bash
docker ps
```

The wallet database container is named:

```text
fintech_wallet_postgres
```

### Port mapping

The PostgreSQL service uses port `5432` inside the container and is exposed on port `5433` on the host.

```text
Application
    |
    v
localhost:5433
    |
    v
Docker container:5432
    |
    v
PostgreSQL
wallet_db
```

Port `5433` avoids a conflict with another PostgreSQL instance on the development machine.

Check database readiness:

```bash
docker exec -it fintech_wallet_postgres \
  pg_isready -U wallet_user -d wallet_db
```

Ensure that `DATABASE_URL` matches the database credentials, database name, and host port configured in `docker-compose.yml`.

---

## Prisma Workflow

This project uses a **Prisma 8 contract-based workflow**.

The main configuration is:

```text
prisma.config.ts
```

The database contract is located at:

```text
src/prisma/contract.prisma
```

Generated contract artifacts include:

```text
src/prisma/
├── contract.prisma
├── contract.json
├── contract.d.ts
└── db.ts
```

### Inspect the contract

```bash
npx prisma contract print
```

### Emit the contract

After modifying the Prisma contract:

```bash
npx prisma contract emit
```

### Create a migration plan

```bash
npx prisma migration plan --name <migration-name>
```

Review the generated migration and confirm the intended schema changes before applying it.

### Apply migrations

```bash
npx prisma db migrate
```

### Check migration status

```bash
npx prisma migration status
```

The database should report that it is up to date when all expected migrations have been applied.

Follow the installed Prisma version's commands and project configuration if the CLI workflow changes.

---

## Running the Application

Start the development server:

```bash
npm run start:dev
```

The default local API base URL is:

```text
http://localhost:3000/api/v1
```

The application uses the global prefix `api/v1`.

Check `main.ts` and the environment configuration if the local port or API prefix differs.

---

## API Endpoints

The following table summarizes the implemented API surface.

All paths are relative to `/api/v1`.

| Method | Endpoint                  | Purpose                                                  | Access                                       |
| ------ | ------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| POST   | `/auth/register`          | Register a user                                          | Public                                       |
| POST   | `/auth/login`             | Authenticate a user                                      | Public                                       |
| POST   | `/auth/refresh`           | Refresh authentication tokens                            | Requires the appropriate refresh-token input |
| POST   | `/auth/logout`            | Log out and manage refresh-token state                   | Authenticated                                |
| GET    | `/wallets/me`             | Retrieve the authenticated user's wallet                 | Authenticated                                |
| POST   | `/wallets/transfers`      | Transfer funds between wallets                           | Authenticated                                |
| GET    | `/wallets/transactions`   | Retrieve transaction history with filters and pagination | Authenticated                                |
| GET    | `/admin/users`            | List, search, and filter users                           | Administrator                                |
| GET    | `/admin/users/:id`        | Retrieve a user's details and wallet information         | Administrator                                |
| PATCH  | `/admin/users/:id/status` | Change a user's account status                           | Administrator                                |
| GET    | `/admin/transactions`     | List and filter financial transactions                   | Administrator                                |

For exact request bodies, response schemas, query parameters, error formats, and authentication requirements, consult [docs/api-design.md](docs/api-design.md) and the DTOs and controllers in the source code.

### Transaction history

The transaction history endpoint supports pagination and filters such as:

- `page` and `limit`
- `startDate` and `endDate`
- `type`
- `status`

The admin transaction endpoint supports corresponding pagination, transaction-type, status, and date-range filters.

### Transfer requests

Transfers require the appropriate request fields and an idempotency key according to the implemented DTO and validation rules. Review the API design document and transfer DTO before making requests.

A repeated request using the same idempotency key should not cause duplicate financial effects.

---

## Authentication and Authorization

Protected endpoints use JWT-based authentication.

The authentication guard verifies the access token and checks the current user against the database. It rejects invalid or expired tokens, missing users, and accounts that are not active. The current database role is used rather than trusting the role claim in an old token.

Administrative endpoints use role-based authorization to restrict access to users with the `ADMIN` role.

Public registration does not accept a user-selected administrator role. Administrative accounts are created through the controlled seed process.

Account status values include:

- `ACTIVE`
- `SUSPENDED`
- `DEACTIVATED`

Suspended or deactivated users cannot access protected routes through the JWT guard. Administrative status changes also include safeguards against disabling the acting administrator or the last active administrator.

See [docs/security.md](docs/security.md) for further details and known security considerations.

---

## Financial Integrity

The transfer workflow is designed to keep the wallet balances and financial records consistent.

At a high level:

```text
Client
  |
  v
Transfer Controller
  |
  v
Transfer Service
  |
  ├── Authentication and authorization
  ├── Input and amount validation
  ├── Idempotency checks
  └── Balance validation
          |
          v
    Database Transaction
          |
          ├── Debit source wallet
          ├── Credit destination wallet
          ├── Create transaction record
          ├── Create debit ledger entry
          └── Create credit ledger entry
          |
          v
        Commit
```

The database transaction is intended to ensure that the related financial changes succeed or fail as one atomic unit.

For a successful transfer, the transaction record and corresponding debit and credit ledger entries provide an auditable representation of the movement. Idempotency and concurrency controls help prevent duplicate effects and invalid balance changes.

The ledger entries complement the current wallet balances; they are not a substitute for reconciliation, operational monitoring, or an independent financial audit.

---

## Testing

The project uses Vitest.

### Run the test suite

```bash
npm test
```

### Run end-to-end tests

```bash
npm run test:e2e
```

### Build the application

```bash
npm run build
```

The unit-test suite covers key behaviors across authentication, authorization, wallet operations, transfer handling, transaction history, validation, and administration.

The most recent recorded verification was:

```text
Test Files: 17 passed
Tests:      93 passed
Build:      successful
```

This records a previous successful run, not a guarantee that every future change passes. Rerun the commands after making changes.

Automated unit tests do not replace integration testing against PostgreSQL, concurrency testing against a real database, penetration testing, or independent security review.

---

## Documentation

The `docs/` directory contains the detailed system documentation.

| Document                                   | Purpose                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Requirements](docs/requirements.md)       | Functional requirements, financial invariants, constraints, and success criteria                   |
| [Architecture](docs/architecture.md)       | Modular monolith structure, module responsibilities, data flow, and architectural decisions        |
| [Database Design](docs/database-design.md) | Data model, relationships, constraints, indexes, and database decisions                            |
| [API Design](docs/api-design.md)           | REST endpoints, request and response patterns, authentication, errors, pagination, and idempotency |
| [Security](docs/security.md)               | Authentication, authorization, financial-operation security, secrets, and future controls          |

When implementation changes materially affect requirements, architecture, database structure, API contracts, or security behavior, update the relevant documentation.

---

## Known Scope and Limitations

This project deliberately focuses on the core wallet and transfer workflow rather than integrating a real payment provider.

The following are **not included in the current completed scope**:

- Real deposit and withdrawal integrations.
- Payment gateway integration.
- External banking or payment-network connectivity.
- Redis and BullMQ background processing.
- Production deployment and operational monitoring.
- Independent penetration testing or financial-system certification.

These features may be introduced later if the project requirements justify them.

A successful build and passing unit tests are necessary quality checks, but they do not establish production readiness. Before handling real customer funds, the system would require additional security review, database-backed integration and concurrency testing, operational controls, reconciliation, monitoring, backup and recovery procedures, and appropriate legal and regulatory review.

---

## Development Workflow

The project follows a documentation-first, incremental workflow:

```text
Requirements
    |
    v
Architecture and Data Design
    |
    v
API and Security Design
    |
    v
Implementation
    |
    v
Automated Testing
    |
    v
Verification
    |
    v
Git Commit and Push
    |
    v
Milestone Tag
```

The development process prioritizes:

1. Correctness before convenience.
2. Database integrity and atomic financial operations.
3. Explicit transaction and ledger records.
4. Idempotency and concurrency safety.
5. Authentication and authorization.
6. Tests that validate business behavior.
7. Incremental complexity instead of premature distributed architecture.

---

## Roadmap

The core learning milestones completed so far include system design, application infrastructure, authentication, wallet management, transfers, transaction history, ledger entries, and administrative functionality.

Potential future work includes:

- Security and documentation review.
- More PostgreSQL-backed integration and concurrency tests.
- CI/CD automation.
- Structured logging, monitoring, and observability.
- Backup and recovery exercises.
- Cloud deployment.
- External payment integration if required by a future scope.

The roadmap is intentionally flexible. New infrastructure should be introduced when it solves a demonstrated problem rather than simply to increase the number of technologies used.

---

## Versioning

Git tags mark meaningful engineering milestones.

Previously recorded milestones include:

- `v0.1.0` — System design.
- `v0.2.0` — Application infrastructure.

Subsequent releases should reflect completed capabilities and verified repository state. Create the next release tag after the documentation and final verification are complete.

---

## License

This project is currently under private development. License information will be added when its distribution model is finalized.
