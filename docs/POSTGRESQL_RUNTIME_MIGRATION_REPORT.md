# PostgreSQL Runtime Migration Report

Generated: 2026-07-13

## Result

Implementation status: **PostgreSQL-only runtime implemented and deployed to the configured PostgreSQL database**.

Live verification status: **PASSED for migration deployment, database readiness, compilation, and the available runtime smoke suite**. No fallback database was used and no credential was written to tracked files.

## Persistence removal

- Deleted the sql.js database adapter and all generic SQLite helpers.
- Deleted legacy SQLite accounting, inventory, finance, seed, backup, and smoke-test modules.
- Removed `sql.js`, `@types/sql.js`, and unused cookie-parser packages.
- Removed checked-in SQLite/JSON database and backup artifacts.
- Removed SQLite branches from operational backup/restore and monitoring.
- Runtime now refuses any driver other than `postgres`.
- Render configuration now selects `PERSISTENCE_DRIVER=postgres`; `DATABASE_URL` remains a deployment secret.
- No dual-write or fallback path remains.

Verification scan result: zero matches under runtime source/package/configuration for `readDb`, `updateDb`, `writeDb`, `dbRun`, `dbFirst`, `dbAll`, `dbTransaction`, `sql.js`, `rawafed.sqlite`, or `rawafed-db.json`.

## Routers mounted

- Core admissions/authentication/finance router
- Accounting router
- Inventory/procurement router
- HR/payroll/report/admin operations router
- Monitoring router

## Migrated endpoint inventory

### Platform and monitoring

- `GET /`
- `GET /api`
- `GET /api/live`
- `GET /api/ready`
- `GET /api/health`

### Authentication and users

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/password`
- `PATCH /api/users/:id/status`

### Registrations, students, notifications, settings, files

- `POST /api/public/registrations`
- `GET /api/registrations`
- `POST /api/registrations`
- `PATCH /api/registrations/:id/status`
- `GET /api/students`
- `GET /api/students/:id`
- `POST /api/students/from-registration/:registrationId`
- `PATCH /api/students/:id`
- `DELETE /api/students/:id`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/public/uploads`
- `POST /api/uploads`
- `DELETE /api/uploads/:id`

### Finance

- `GET /api/finance/accounts`
- `GET /api/finance/invoices`
- `POST /api/finance/invoices`
- `GET /api/finance/payments`
- `POST /api/finance/payments`
- `GET /api/finance/expenses`
- `POST /api/finance/expenses`

### Accounting

- `GET /api/accounting/accounts`
- `GET /api/accounting/accounts/suggest-code`
- `POST /api/accounting/accounts`
- `PATCH /api/accounting/accounts/:id`
- `DELETE /api/accounting/accounts/:id`
- `PATCH /api/accounting/accounts/:id/archive`
- `PATCH /api/accounting/accounts/:id/move`
- `GET /api/accounting/cost-centers`
- `GET /api/accounting/expense-accounts`
- `GET /api/accounting/payment-accounts`
- `GET /api/accounting/revenue-accounts`
- `GET /api/accounting/receivable-accounts`
- `GET /api/accounting/payable-accounts`
- `GET /api/accounting/journal-entries`
- `POST /api/accounting/journal-entries`
- `POST /api/accounting/journal-entries/:id/reverse`
- `GET /api/accounting/ledger/:accountId`
- `GET /api/accounting/trial-balance`
- `GET /api/accounting/dashboard`
- `GET /api/accounting/income-statement`
- `GET /api/accounting/balance-sheet`
- `GET /api/accounting/cash-flow`
- `GET /api/accounting/vat`
- `GET /api/accounting/reconciliation`
- `GET /api/accounting/customers`
- `GET /api/accounting/customers/:id`
- `GET /api/accounting/customers/:id/statement`
- `GET /api/accounting/customers/:id/installments`
- `POST /api/accounting/customers/:id/installment-plans`
- `POST /api/accounting/customer-payments`
- `GET /api/accounting/suppliers`
- `POST /api/accounting/suppliers`
- `PATCH /api/accounting/suppliers/:id`
- `DELETE /api/accounting/suppliers/:id`
- `GET /api/accounting/suppliers/:id/profile`
- `GET /api/accounting/suppliers/:id/statement`
- `GET /api/accounting/supplier-aging`
- `POST /api/accounting/supplier-payments`
- `GET /api/accounting/cashboxes`
- `POST /api/accounting/cashboxes`
- `PATCH /api/accounting/cashboxes/:id`
- `GET /api/accounting/banks`
- `POST /api/accounting/banks`
- `PATCH /api/accounting/banks/:id`
- `POST /api/accounting/transfers`
- `GET /api/accounting/search`

### Inventory and procurement

- `GET /api/inventory/dashboard`
- `GET /api/inventory/categories`
- `GET /api/inventory/units`
- `GET /api/inventory/warehouses`
- `POST /api/inventory/warehouses`
- `PATCH /api/inventory/warehouses/:id`
- `GET /api/inventory/items`
- `POST /api/inventory/items`
- `PATCH /api/inventory/items/:id`
- `GET /api/inventory/movements`
- `POST /api/inventory/movements`
- `POST /api/inventory/movements/:id/reverse`
- `GET /api/inventory/purchase-requests`
- `POST /api/inventory/purchase-requests`
- `PATCH /api/inventory/purchase-requests/:id/status`
- `GET /api/inventory/purchase-orders`
- `POST /api/inventory/purchase-orders`
- `PATCH /api/inventory/purchase-orders/:id/status`
- `GET /api/inventory/goods-receipts`
- `POST /api/inventory/goods-receipts`
- `POST /api/inventory/student-issues`
- `GET /api/inventory/transfers`
- `POST /api/inventory/transfers`
- `GET /api/inventory/counts`
- `POST /api/inventory/counts`
- `GET /api/inventory/suppliers`
- `GET /api/inventory/reports`

### HR and payroll

- `GET /api/staff`
- `POST /api/staff`
- `PATCH /api/staff/:id`
- `DELETE /api/staff/:id`
- `GET /api/payroll/runs`
- `POST /api/payroll/runs`

### Administration and reports

- `GET /api/admin/export`
- `GET /api/admin/integrity`
- `POST /api/admin/announcements`
- `GET /api/reports/admissions`
- `GET /api/reports/finance`
- `GET /api/reports/outstanding`
- `GET /api/reports/daily-payments`
- `GET /api/reports/monthly-payments`

## Endpoint coverage comparison

Legacy method/path pairs without a PostgreSQL definition: **0**.

Known PostgreSQL routes mounted: **all core, accounting, inventory, operations, and monitoring routers**.

Endpoints intentionally blocked by application routing: **0**. Unknown endpoints return HTTP 404.

## Schema and migration changes

- Added normalized `PayrollRun` and `PayrollLine` models.
- Added staff compatibility profile stored in PostgreSQL JSON, not filesystem JSON.
- Added payroll relations to staff, user, and journal entry.
- Added generated incremental migration `20260713000000_complete_postgresql_runtime`.
- Added idempotent payroll chart-of-account seeds.

## Verification completed

- Prisma schema formatting and validation passed.
- Prisma Client 6.19.3 generation passed.
- Both migrations were detected; `20260713000000_complete_postgresql_runtime` was applied successfully and a repeat deploy reported no pending migrations.
- TypeScript backend build passed.
- Angular production build passed without an API contract change.
- The executable runtime suite started the compiled API, queried PostgreSQL through `/api/ready`, and passed 4/4 tests.
- Production dependency audits reported zero vulnerabilities for the Angular and backend packages.
- Route comparison reported zero missing legacy method/path pairs.
- Legacy persistence/dependency scan reported zero matches.

## Remaining verification blockers

The repository's available automated suite contains 4 runtime smoke tests. It proves process startup, liveness, PostgreSQL-backed readiness, and the standardized 404 contract, but it does not yet provide exhaustive behavioral proof for registration approval, finance/accounting posting, inventory concurrency and reconciliation, restart/reconnect, backup/restore, or every Angular response shape. These remain cutover gates even though compilation and migration deployment pass.
