# Fintech Wallet API

A production-oriented financial wallet API built with **NestJS, TypeScript, PostgreSQL, Docker, and Prisma 8**.

The project focuses on the engineering principles required to build reliable financial systems, including transactional integrity, concurrency control, idempotency, authentication, authorization, ledger-based accounting, security, testing, and operational reliability.

The system is being developed as a **modular monolith**, with a deliberate focus on correctness and maintainability before introducing distributed-system complexity.

---

## Overview

The Fintech Wallet API provides the backend foundation for a digital financial system where users can manage wallets and perform financial transactions.

The system is designed around financial invariants such as:

- Money must not disappear.
- Money must not be created unintentionally.
- Wallet balances must not become negative.
- Unauthorized users must not move funds.
- A financial operation must not partially complete.
- Duplicate requests must not create duplicate financial effects.
- Every completed financial operation must be auditable.
- Wallet balances and financial records must remain consistent.

These requirements make the project more than a conventional CRUD API. Database transactions, constraints, concurrency, and financial records are treated as core parts of the application architecture.

---

## Architecture

The application follows a **modular monolith architecture**.

At a high level:

```text
                    Client
                      │
                      ▼
                HTTP / REST API
                      │
                      ▼
                 Controllers
                      │
                      ▼
               Application Services
                      │
                      ▼
                 Domain Logic
                      │
                      ▼
                Data Access Layer
                      │
                      ▼
                   Prisma
                      │
                      ▼
                 PostgreSQL
```

The application is organized around business modules rather than technical layers alone.

Planned core modules include:

```text
Auth
Users
Wallets
Transfers
Transactions
Ledger
Admin
```

Infrastructure concerns such as configuration, database access, validation, security, and common utilities are separated from business modules.

See the detailed architecture documentation:

**[Architecture](docs/architecture.md)**

---

## Technology Stack

| Technology | Purpose                          |
| ---------- | -------------------------------- |
| TypeScript | Application language             |
| NestJS     | Backend framework                |
| PostgreSQL | Primary relational database      |
| Prisma 8   | ORM and schema/migration tooling |
| Docker     | Local infrastructure             |
| Vitest     | Testing framework                |
| Supertest  | HTTP/E2E testing                 |
| Git        | Version control                  |
| GitHub     | Source control and collaboration |

Planned infrastructure includes Redis, BullMQ, CI/CD, observability tooling, and cloud deployment.

---

## Repository Structure

```text
fintech-wallet-api/
│
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
├── src/
│   ├── prisma/
│   │   ├── contract.prisma
│   │   ├── contract.json
│   │   ├── contract.d.ts
│   │   └── db.ts
│   │
│   ├── app.module.ts
│   ├── app.module.spec.ts
│   └── main.ts
│
├── test/
│   └── app.e2e-spec.ts
│
├── .env.example
├── docker-compose.yml
├── nest-cli.json
├── package.json
├── prisma.config.ts
├── tsconfig.json
├── vitest.config.ts
└── vitest.config.e2e.ts
```

As the application grows, business modules will be added under `src/`.

---

# Getting Started

## Prerequisites

Install the following:

- Node.js
- npm
- Docker Desktop
- Git

Verify the installations:

```bash
node --version
npm --version
docker --version
docker compose version
git --version
```

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd fintech-wallet-api
```

Install dependencies:

```bash
npm install
```

---

## Environment Configuration

Create a local environment file from the example:

```bash
cp .env.example .env
```

Example development configuration:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://wallet_user:wallet_password@localhost:5433/wallet_db

JWT_SECRET=
JWT_REFRESH_SECRET=

REDIS_URL=
```

### Environment security

The `.env` file contains local secrets and must not be committed to source control.

Only `.env.example` should be committed.

---

# Database

## PostgreSQL

PostgreSQL is provided through Docker Compose.

Start the database:

```bash
docker compose up -d
```

Check running containers:

```bash
docker ps
```

The wallet database container is:

```text
fintech_wallet_postgres
```

### Port mapping

The PostgreSQL service runs on port `5432` inside the container and is exposed as port `5433` on the host:

```text
Host
localhost:5433
     │
     ▼
Docker
container:5432
     │
     ▼
PostgreSQL
wallet_db
```

Port `5433` is used to avoid a local port conflict with another PostgreSQL instance.

Check database readiness:

```bash
docker exec -it fintech_wallet_postgres \
  pg_isready -U wallet_user -d wallet_db
```

---

# Prisma

This project uses the **Prisma 8 contract-based workflow**.

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

## Inspect the contract

```bash
npx prisma contract print
```

## Emit the contract

After modifying the Prisma contract:

```bash
npx prisma contract emit
```

## Create a migration

Create a migration from contract changes:

```bash
npx prisma migration plan --name <migration-name>
```

Always review the generated migration before applying it.

## Apply migrations

```bash
npx prisma db migrate
```

## Check migration status

```bash
npx prisma migration status
```

The database should report:

```text
✔ Up to date
```

---

# Running the Application

Start the development server:

```bash
npm run start:dev
```

The application listens on:

```text
http://localhost:3000
```

The API surface will grow as application modules are implemented.

---

# Testing

The project uses **Vitest**.

## Unit tests

```bash
npm run test
```

## End-to-end tests

```bash
npm run test:e2e
```

## Build

```bash
npm run build
```

Tests will progressively move from infrastructure-level checks toward business-critical financial behavior.

Future test coverage will include:

- Authentication
- Authorization
- Wallet ownership
- Balance validation
- Deposits
- Withdrawals
- Transfers
- Transaction atomicity
- Idempotency
- Concurrency
- Ledger consistency
- Failure recovery

---

# Engineering Documentation

Detailed system documentation is maintained separately under `docs/`.

### Requirements

Defines the functional requirements, financial invariants, system constraints, and success criteria.

**[Read requirements →](docs/requirements.md)**

### Architecture

Describes the modular monolith, application boundaries, responsibilities, data flow, and architectural decisions.

**[Read architecture →](docs/architecture.md)**

### Database Design

Documents the data model, entities, relationships, constraints, indexes, and database decisions.

**[Read database design →](docs/database-design.md)**

### API Design

Defines REST conventions, endpoints, request/response patterns, authentication requirements, errors, pagination, and idempotency.

**[Read API design →](docs/api-design.md)**

### Security

Documents authentication, authorization, financial operation security, database security, secrets, rate limiting, and future security controls.

**[Read security →](docs/security.md)**

---

# Financial System Design

Financial operations are designed around strong consistency and explicit financial records.

A transfer will eventually follow a flow similar to:

```text
Client
  │
  ▼
Transfer Controller
  │
  ▼
Transfer Service
  │
  ├── Authentication
  ├── Authorization
  ├── Input validation
  ├── Idempotency
  └── Balance validation
          │
          ▼
    Database Transaction
          │
          ├── Debit source wallet
          ├── Credit destination wallet
          ├── Create transaction record
          ├── Create debit ledger entry
          └── Create credit ledger entry
          │
          ▼
        Commit
```

The database transaction is intended to guarantee that the financial operation succeeds or fails as one atomic unit.

The ledger will provide an auditable record of financial movements independently of the wallet's current balance.

---

# Engineering Principles

The project follows these principles:

### 1. Correctness before convenience

Financial operations must be correct before they are optimized for speed or convenience.

### 2. Database integrity matters

Important financial invariants should be enforced through a combination of application logic and database constraints.

### 3. Atomic financial operations

Operations that modify financial state should execute atomically.

### 4. Explicit financial records

Money movement should produce auditable transaction and ledger records.

### 5. Idempotency

Retrying the same financial request must not unintentionally produce multiple financial effects.

### 6. Concurrency safety

Concurrent requests must not allow invalid financial states such as double spending.

### 7. Security by design

Authentication, authorization, input validation, secrets management, and financial controls are treated as architectural concerns.

### 8. Test business behavior

Tests should increasingly validate financial rules and system behavior rather than simply maximizing code coverage.

### 9. Incremental complexity

The system starts as a modular monolith. Distributed infrastructure will only be introduced when there is a clear engineering reason for it.

---

# Versioning

The project uses Git tags to mark meaningful engineering milestones.

Current development history:

```text
v0.1.0
System design
```

```text
v0.2.0
Application infrastructure
```

Future versions will represent significant completed capabilities rather than arbitrary commits.

Example:

```text
v0.3.0  Authentication
v0.4.0  Wallet management
v0.5.0  Financial transactions
v0.6.0  Ledger
```

Git history provides the detailed implementation history between releases.

---

# Development Workflow

The project follows a documentation-first engineering workflow:

```text
Requirements
     │
     ▼
Architecture
     │
     ▼
Database / API / Security Design
     │
     ▼
Implementation
     │
     ▼
Testing
     │
     ▼
Verification
     │
     ▼
Commit
     │
     ▼
Milestone Tag
```

Important architectural changes should be reflected in the appropriate document under `docs/`.

Not every code change requires documentation changes. Documentation is updated when requirements, architecture, data models, APIs, or security decisions materially change.

---

# Roadmap

The system is being developed incrementally around the following capabilities:

```text
System Design
     ↓
Application Infrastructure
     ↓
Authentication & Identity
     ↓
Wallet Management
     ↓
Financial Transactions
     ↓
Double-Entry Ledger
     ↓
Idempotency & Reliability
     ↓
Redis & Background Processing
     ↓
Security Hardening
     ↓
Observability & Production Readiness
     ↓
Cloud Deployment
```

The roadmap represents the intended engineering direction and may evolve as implementation and architectural discoveries are made.

---

## License

This project is currently under private development.

License information will be added when the project's distribution model is finalized.
