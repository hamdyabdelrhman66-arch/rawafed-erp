# Accounting event reconciliation matrix

All monetary source operations below post inside the same PostgreSQL transaction as their operational record. Journal lines feed `LedgerRepository`, then `FinancialStatementsService` (ledger, trial balance, statements, and dashboard). Posted history is immutable; corrections use reversal/correction journals.

| Source operation | Status | Journal source/event | Current automated coverage | Reversal / correction status |
| --- | --- | --- | --- | --- |
| Student invoice: registration fee, tuition, books, uniform, activities, transportation | Supported | `finance_invoice` | VAT/category unit tests and categorized-payment integration test | Posted journal immutable; discount credit-note path exists. Full invoice void/reissue E2E still requires the isolated DB. |
| Student payment / receipt | Supported | `finance_payment` | Allocation, validation, error-classification unit tests and categorized-payment integration test | Cancellation/refund remains an operational workflow to verify in integration. |
| Approved student discount | Supported | `STUDENT_DISCOUNT_APPROVED` | Ten discount unit tests plus categorized-payment integration test | `STUDENT_DISCOUNT_CANCELLED` posts a reversal journal. |
| Accounting expense / expense-backed supplier bill | Supported | `accounting_expense` | Operational-contract integration test | No destructive journal delete; source correction/reversal must be used. |
| Expense payment | Supported | `accounting_expense_payment` | Operational-contract integration test | Source correction/reversal required; dedicated cancellation E2E not yet present. |
| Supplier payment | Supported | `supplier_payment` | Operational-contract integration test | Source correction/reversal required; dedicated cancellation E2E not yet present. |
| Purchase-order supplier invoice as a standalone document | Not implemented | — | None | Blocking if a supplier invoice must exist independently of expense or goods receipt. |
| Goods receipt | Supported for posting | `inventory_goods_receipt` / `GOODS_RECEIPT_POSTED` | Journal-line, missing-mapping rollback-precondition, and idempotent-retry unit tests; full DB reconciliation is blocked by the missing isolated DB | Receipt reversal is not implemented; posted journal itself remains immutable. |
| Student books/uniform stock issue | Supported | `inventory_cost` | Category mapping unit tests; DB workflow requires integration run | Stock reversal calls the accounting reversal. |
| Warehouse transfer | Supported as non-GL quantity movement | No GL entry | Source audit confirms one atomic warehouse transaction | Same owned inventory account, so no GL movement. A controlled reverse-transfer workflow is not implemented. |
| Inventory adjustment that changes value/quantity | Not accounting-complete | Inventory event only | None | Blocking: generic adjustment changes stock but does not post an adjustment journal. |
| Inventory count | Draft-only | — | None | Count approval/posting and variance journal are not implemented. |
| Fixed-asset acquisition | Supported | `fixed_asset_acquisition` | Fixed-assets integration test | Operational correction/disposal; posted journal remains immutable. |
| Monthly depreciation | Supported | `fixed_asset_depreciation` | Fixed-assets integration test | Reversal/correction uses journal controls; dedicated depreciation reversal E2E pending. |
| Asset disposal/sale/write-off | Supported | `fixed_asset_*` | Fixed-assets integration test | Correct the originating disposal transaction; dedicated reversal E2E pending. |
| Payroll run | Supported | `payroll_run` | Source/build verified; no dedicated integration test | Controlled payroll reversal is not proven by an automated integration test. |
| Payroll payment | Supported | `payroll_payment` | Source/build verified; no dedicated integration test | Payment reversal is not proven by an automated integration test. |
| Cash/bank transfer | Supported | `cash_bank_transfer` | Operational-contract integration test | Posted transfer correction must reverse; dedicated reversal E2E pending. |
| Manual journal | Supported | `manual_journal` | Journal deletion unit tests and correction integration test | Only manual DRAFT may be deleted. Posted entries require reversal/correction. |
| Journal reversal / correction | Supported | `journal_reversal`, `journal_correction` | Journal-delete unit and journal-correction integration tests | Original, reversal, and corrected journals are preserved and linked. |

## Reconciliation checks

`ReconciliationService` is report-only and checks unbalanced journals, duplicate sources, invoices/payments without journals, receivables mismatch, trial-balance equality, balance-sheet equality, dashboard balance, VAT, duplicate invoices/notifications, invalid account hierarchy, and students without finance accounts. It never repairs production data automatically.

The account ledger now applies the configured opening balance, prior posted movements, inclusive date boundaries, and current-period transactions. Both `transactions` and the compatibility alias `entries` return the same rows, and every row exposes `balance` plus `runningBalance`.

## Required configuration

The Chart of Accounts must contain active posting accounts for every referenced system key/mapping. Goods receipts specifically require `inventory-main`, `vat-input` when VAT is non-zero, and the selected supplier payable account. Missing mappings are checked before receipt/stock writes and stop the transaction with `ACCOUNT_MAPPING_MISSING`. The whole receipt, stock movement, stock balance, event, journal, lines, audit, and notification sequence is one serializable PostgreSQL transaction. A client-generated idempotency key produces a stable GRN, and a retry returns the existing receipt instead of duplicating stock or journals.
