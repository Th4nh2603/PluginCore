# MarketingDashboard data reference

This document records the local database and security conventions from the
MarketingDashboard repository for use as a reference in this repository. It
does not make PluginCore responsible for running that application's stack.

## Local environment

- Required tools: Node.js, pnpm, and Docker Desktop.
- The local PostgreSQL 18 container is started with `docker compose up -d db`.
- The database is published at `localhost:5433`.
- The API environment template is `apps/api/.env.example`; a local
  `apps/api/.env` file must not be committed.

## Prisma data model

MarketingDashboard uses a multi-file Prisma schema:

```text
apps/api/prisma/schema/
  schema.prisma  # PostgreSQL generator and datasource
  user.prisma    # Role enum and User model
```

Synchronize the schema with the local database with:

```powershell
pnpm --filter ./apps/api exec prisma db push
```

Regenerate Prisma Client after schema changes:

```powershell
pnpm --filter ./apps/api exec prisma generate
```

On Windows, stop the API development server and Prisma Studio before running
`prisma generate` so the engine files are not locked. Open the data UI with:

```powershell
pnpm --filter ./apps/api exec prisma studio
```

## User identifiers and roles

- `User.id` is a `BigInt` in the database.
- API responses expose it as a JavaScript-safe, 12-digit number from
  `100000000000` through `999999999999`.
- IDs are generated randomly by the API; the primary key enforces uniqueness.
- The API retries only primary-key ID collisions. Duplicate-email errors are
  returned normally.
- Supported roles are `USER` and `ADMIN`.

## Security constraints

- Never commit `apps/api/.env` or credentials.
- User passwords are hashed with Argon2id.
- Roles are stored in the database. Authorization middleware for administrative
  endpoints is not yet implemented in MarketingDashboard.

## Source validation commands

```powershell
pnpm --filter ./apps/api test
pnpm build
```
