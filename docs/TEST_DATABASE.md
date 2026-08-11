# Isolated PostgreSQL test database

`DATABASE_URL` is production and must never be used by automated integration tests.

## One-time Neon setup

1. In the Neon project, create a separate branch named `rawafed-test` from a schema-only or disposable baseline. Do not reuse the production branch endpoint.
2. Copy the **pooled** connection string for that branch into `backend/.env.test.local` as `TEST_DATABASE_URL`.
3. Keep the production URL in `DATABASE_URL`; the guard compares the resolved host, port, and database name and refuses a match.
4. Add the exact test endpoint to the allowlist.

```dotenv
NODE_ENV=test
DATABASE_URL=postgresql://production-user:***@production-endpoint/neondb?sslmode=require
TEST_DATABASE_URL=postgresql://test-user:***@test-endpoint/neondb?sslmode=require
TEST_DATABASE_ALLOWLIST=test-endpoint/neondb
```

Never commit either connection string. For a CI secret store, configure the same three variables there.

## Commands

```bash
cd backend
npm run db:test:guard
npm run db:reset:test
npm run test:integration
```

`db:reset:test` runs only after the safety guard succeeds. `ALLOW_DESTRUCTIVE_TEST_DATABASE=yes` can satisfy the allowlist requirement, but it **cannot** bypass a target matching `DATABASE_URL` or `PRODUCTION_DATABASE_URL`.

Unit tests do not require a database and can be run independently. Integration tests import the guarded Prisma client and refuse to start without the isolated target.
