# Production runbook

## Deploy

1. Require green CI: frontend/backend builds, tests, audits, migration dry run, API contracts, accounting/inventory reconciliation.
2. Create and validate an off-platform backup.
3. Apply Prisma migrations with a direct Neon connection in a controlled pre-deploy job.
4. Deploy one instance, verify `/api/live`, `/api/ready`, `/api/health`, login/refresh/logout, and critical read-only flows.
5. Run reconciliation and compare control totals. Expand traffic only after approval.

## Required environment

`NODE_ENV=production`, explicit `PERSISTENCE_DRIVER`, `DATABASE_URL`, separate 32+ character `JWT_SECRET` and `REFRESH_SECRET`, exact `CORS_ORIGIN`, `PORT`, `BUILD_VERSION`, and `GIT_COMMIT`. Runtime secrets belong in Render/secret management, never repository files.

## Monitoring

- Liveness: `/api/live` checks the process only.
- Readiness: `/api/ready` checks database, disk headroom, memory details, migration version, build and commit.
- Health: `/api/health` returns the same full operational snapshot.
- Alert on readiness failure, 5xx rate, p95 latency, DB latency/query count, memory growth, disk below 100 MiB, backup failure, and reconciliation mismatch.

## Routine operations

Daily: health, backups, failed login/error review. Weekly: reconciliation, slow queries, low stock, orphan/duplicate checks. Monthly: restore drill sample, dependency updates, inactive users, role review. Quarterly: full DR exercise, access recertification, performance baseline, retention purge.

## Rollback

Application rollback is allowed only when schema remains backward compatible. Otherwise stop writes and follow the disaster recovery guide. Never edit finance journals or stock history directly; generate correction reports and approved reversing transactions.
