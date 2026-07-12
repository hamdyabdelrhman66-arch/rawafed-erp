# Phase 3 accounting status

Phase 3 is **implemented but not complete or approved for production**. Completion requires all accounting integration and API contract tests to pass against PostgreSQL. This workspace has no `DATABASE_URL`, `TEST_DATABASE_URL`, PostgreSQL client, or Docker runtime.

## Migrated PostgreSQL accounting modules

- Chart of accounts and account hierarchy
- Cost centers
- Customer/student receivable accounts
- Suppliers and payable accounts
- Cashboxes and banks
- Balanced journals, journal lines, source idempotency, and reversals
- Invoice posting: debit AR, credit revenue, credit output VAT
- Payment posting: debit cash/bank, credit AR only
- Accounting expenses and input VAT
- Supplier and customer payments
- Cash/bank transfers
- Installment plans and installments
- General ledger, trial balance, income statement, balance sheet, cash flow, dashboard
- VAT summary and report-only reconciliation endpoint
- Global accounting search and supplier aging compatibility endpoints

The PostgreSQL accounting router covers every pre-existing `/api/accounting/*` URL. It is mounted before the PostgreSQL-mode legacy guard. Inventory, procurement, payroll, and other unmigrated endpoints remain HTTP 503 in PostgreSQL mode and cannot fall through to SQLite.

## Accounting controls implemented

- Posted entries are rejected unless debit equals credit in integer cents.
- A line cannot contain both debit and credit, or neither.
- `sourceType + sourceId` is unique and checked before insertion.
- Invoice/payment/expense/supplier-payment/customer-payment/transfer sources are idempotent.
- Invoice and its journal are created in one Prisma transaction.
- Payment, allocation, status, audit, outbox, and journal are created in one Prisma transaction.
- Payments do not reference revenue or VAT accounts.
- Invoice VAT is posted separately from revenue.
- Journal reversal swaps original debit/credit lines and marks the original reversed.
- Reports query only `POSTED`, non-deleted journal entries.
- Reconciliation is report-only and never modifies history.

## Prisma models added or extended

- Extended `ChartOfAccount`, `JournalEntry`, `JournalLine`, `User`, `Student`, and `Registration`
- Added `CostCenter`, `AccountingCustomer`, `AccountingSupplier`, `Cashbox`, `Bank`, `AccountingExpense`, `SupplierPayment`, `CustomerPayment`, `CashBankTransfer`, `InstallmentPlan`, and `Installment`
- Retained normalized `FinanceInvoice`, `FinancePayment`, `PaymentAllocation`, `VatRate`, and `AccountingOutbox`

## Verification performed

- Prisma schema validation: passed
- Prisma client generation: passed
- TypeScript build: passed
- Static architecture and accounting-safety tests: 13 passed
- Existing accounting route coverage comparison: no missing routes
- Forbidden SQLite helper scan in new accounting controllers/services/repositories: no matches

## Verification not performed

- The 20 required PostgreSQL accounting integration scenarios
- Live old-vs-new HTTP response comparison
- Restart persistence test
- Live reconciliation report
- Source import followed by AR/AP/VAT/cash control-total reconciliation

These are hard blockers, not waived tests.

## Remaining SQLite dependencies

- `src/accounting.ts` remains for the default SQLite driver until PostgreSQL verification and cutover approval. PostgreSQL accounting routes never call it.
- Inventory and procurement still use SQLite and are blocked in PostgreSQL mode.
- Payroll and HR accounting postings still use SQLite and are blocked in PostgreSQL mode.
- Legacy full-database export/integrity/report endpoints remain blocked in PostgreSQL mode.

## Exact blockers before Phase 4

1. Provision a disposable PostgreSQL database and set `TEST_DATABASE_URL`.
2. Apply migrations and seeds, then execute all 20 accounting scenarios.
3. Generate and review the live reconciliation correction report.
4. Reconcile open invoices to AR, supplier activity to AP, invoice/expense VAT to the VAT ledger, and cash/bank documents to ledger movements.
5. Add and verify a domain-level finance refund endpoint; journal reversal exists, but payment refund lifecycle/status behavior is not yet proven.
6. Run HTTP contract comparisons for all existing accounting endpoints.
7. Resolve or approve the Prisma CLI dependency security advisory.

Production continues to default to `PERSISTENCE_DRIVER=sqlite`. There is no dual-write path, and Angular files and endpoint URLs remain unchanged.
