# Neon PostgreSQL deployment

1. Create the Neon database and use its pooled connection string as `DATABASE_URL` on Render. Keep SSL enabled.
2. Set independent random values of at least 32 characters for `JWT_SECRET` and `REFRESH_SECRET`; set `CORS_ORIGIN` to the exact frontend origins and `PORT` to Render's port.
3. Build with `npm ci && npm run db:generate && npm run build`.
4. Run `npm run db:migrate` as a pre-deploy command. Prisma migrations are the only schema deployment mechanism.
5. Run `SEED_ADMIN_PASSWORD=<one-time-secret> npm run seed` once. Remove the seed password afterwards.
6. Start with `npm start` only after the Phase 3 runtime cutover is complete.

For development, copy `.env.example` to `.env`, supply a PostgreSQL URL, run `npm run db:migrate:dev`, then `npm run seed`.

The Prisma client exposes `checkDatabaseConnection()` in `src/prisma/client.ts`; the final cutover health controller must call it and return HTTP 503 when PostgreSQL is unavailable.
