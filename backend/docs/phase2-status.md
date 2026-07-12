# Phase 2 status

Phase 2 implementation is present but is **not approved for production cutover**. The PostgreSQL runtime requires verification against a disposable PostgreSQL database; none is available in this workspace (`psql`, Docker, `DATABASE_URL`, and `TEST_DATABASE_URL` are absent).

## Migrated PostgreSQL core modules

- Authentication, active-session lookup, refresh-token hashing/validation/revocation
- Users and password/deactivation token revocation
- Registrations and concurrency-safe transactional creation
- Idempotent registration approval
- Students and finance-reference deletion protection
- Notifications and audit records
- Settings and uploaded-file metadata
- Finance accounts with normalized fee items and calculated totals
- Invoices, payments, payment allocations, canonical legacy invoices, and accounting outbox

All PostgreSQL code follows controller → service → repository → Prisma. Controllers contain neither Prisma nor legacy persistence calls. Multi-table registration, authentication, user security, invoice, and payment operations use Prisma transactions.

## Remaining SQLite-dependent modules

- Accounting ledger and chart-of-accounts behavior
- Inventory and stock movements
- Procurement and suppliers
- Payroll and HR accounting postings
- Legacy reports and administrative export/integrity endpoints that aggregate the full SQLite shape

With `PERSISTENCE_DRIVER=postgres`, unmatched `/api` routes are returned as HTTP 503. They never fall through to SQLite. With no flag, runtime remains SQLite.

## Verification results

- TypeScript build: passed
- Prisma validation/client generation: passed
- Schema/architecture tests: 7 passed
- Required endpoint path contract inventory: passed
- SQLite-default startup and health request: passed
- PostgreSQL-without-`DATABASE_URL` fail-fast check: passed
- PostgreSQL integration tests: blocked; no PostgreSQL test database is available
- Live old-vs-new HTTP response comparison: blocked by the same missing database

The source SQLite validation ran against an isolated copy, not the live file. See `phase2-migration-validation.json`. It found 9 users, 3 registrations, 3 students, 3 finance accounts, 2 invoices, 2 payments, 49 audit logs, and 9 notifications; no duplicate IDs, broken foreign keys, orphan invoices/payments, accounts without students, or registrations without students were found. Import counts remain intentionally unset because no PostgreSQL target was available.

## Production cutover blockers

1. Provide an isolated PostgreSQL/Neon test URL and run migrations/seeds.
2. Execute service integration tests for approval idempotency, invoice/payment lifecycle, overpayment/duplicate rejection, persistence after restart, refresh revocation, and audit creation.
3. Run live REST contract comparisons between SQLite and PostgreSQL drivers.
4. Import the copied SQLite database and verify target count differences are zero.
5. Resolve the Prisma CLI dependency audit advisory or approve its version risk.
6. Complete a staging soak test with PostgreSQL core routes while Phase 3 routes remain disabled.

## Phase 3 recommendation

Migrate the accounting bounded context as one atomic unit: chart of accounts, customers/receivables, cash/bank, journal entries/lines, invoice/payment outbox consumption, trial balance, dashboard ledger totals, suppliers/payables, expenses, and all related reports. Do not include inventory until accounting posting dependencies and rollback behavior pass.

## Compatibility and isolation confirmations

- No Angular files or endpoint URLs were changed.
- Existing success response shapes are mapped in the PostgreSQL services; live comparison is still required.
- No dual-write code path exists.
- Production defaults to `PERSISTENCE_DRIVER=sqlite`.
- PostgreSQL mode cannot use legacy API persistence because unmatched endpoints are blocked before legacy handlers.
