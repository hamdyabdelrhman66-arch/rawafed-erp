# Rawafed ERP parallel Railway environment

This environment is independent from the existing Vercel, Render, and Neon production path. It must use its own Railway PostgreSQL service and must never receive the production Neon `DATABASE_URL` as a runtime variable.

## Services

### `rawafed-erp-frontend`

- Root directory: `/`
- Config file: `/railway.frontend.toml`
- Build: `npm ci && npm run build`
- Start: `npm run start:railway`
- Health check: `/health`
- Required variable:
  - `API_BASE_URL=https://${{rawafed-erp-backend.RAILWAY_PUBLIC_DOMAIN}}/api`

The runtime server supplies `/runtime-config` and falls back to Angular `index.html` for deep links. Vercel continues to serve the static `public/runtime-config`, whose empty value preserves the existing Render fallback. The extensionless file is deliberately outside the service-worker JavaScript asset cache so environment changes cannot be masked by a stale PWA cache.

### `rawafed-erp-backend`

- Root directory: `/backend`
- Config file: `/backend/railway.toml`
- Build: `npm ci && npm run db:generate && npm run build`
- Pre-deploy: `npm run db:migrate`
- Start: `npm start`
- Health check: `/api/ready`

Required Railway variables:

- `NODE_ENV=production`
- `PERSISTENCE_DRIVER=postgres`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `DATABASE_USE_NEON_POOLER=false`
- `DATABASE_CONNECTION_LIMIT=5`
- `DATABASE_POOL_TIMEOUT=20`
- `DATABASE_CONNECT_TIMEOUT=15`
- `JWT_SECRET=<new random value of at least 32 characters>`
- `REFRESH_SECRET=<different new random value of at least 32 characters>`
- `CORS_ORIGIN=https://${{rawafed-erp-frontend.RAILWAY_PUBLIC_DOMAIN}},https://rawafed-erp.vercel.app`
- `BUILD_VERSION=railway-staging`
- `LOG_LEVEL=info`

Generate `JWT_SECRET` and `REFRESH_SECRET` specifically for Railway. Do not copy them from Render. Do not set `DATABASE_POOL_URL` to Neon.

For persistent uploads, attach a Railway volume to the backend at `/data` and set `RAWAFED_UPLOAD_DIR=/data/uploads`. Database persistence itself is provided exclusively by Railway PostgreSQL.

### `Postgres`

Use the Railway PostgreSQL plugin. Reference its `DATABASE_URL` from the backend. Do not paste or reference the Neon production URL.

## Initialization

Migrations run automatically as the backend pre-deploy command. For an empty Railway database, run the idempotent reference-data seed once only when an initial administrator is required:

```sh
railway run --service rawafed-erp-backend npm run seed
```

Set a new temporary `SEED_ADMIN_PASSWORD` only for the seed, then remove it after the administrator is created. The seed upserts branches, roles, permissions, the chart of accounts, and school reference settings; it does not seed fake student, invoice, payment, or journal activity.

## Optional read-only production snapshot

Do not copy production automatically. If explicitly approved later, take a source-only Neon dump and restore it into Railway:

```sh
pg_dump "$NEON_SOURCE_URL" --format=custom --no-owner --no-acl --file=rawafed-neon-snapshot.dump
pg_restore --dbname="$RAILWAY_DATABASE_URL" --no-owner --no-acl rawafed-neon-snapshot.dump
```

Never use `--clean` against Neon and never run `prisma migrate reset` against either production environment.
