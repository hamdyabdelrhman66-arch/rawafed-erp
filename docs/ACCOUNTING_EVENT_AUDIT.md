# Accounting event reconciliation matrix

All monetary source operations below post inside the same PostgreSQL transaction as their operational record. Journal lines feed `LedgerRepository`, then `FinancialStatementsService` (ledger, trial balance, statements, and dashboard). Posted history is immutable; corrections use reversal/correction journals.

| Source operation | Journal source/event | Debit / credit policy source | Reversal / correction |
| --- | --- | --- | --- |
| Student invoice (registration, tuition, books, uniform, activities, transportation) | `finance_invoice` | Revenue-category mappings plus the student receivable account; VAT uses the backend tax decision | Void/credit-note operational workflow; posted journal is not deleted |
| Student payment / receipt | `finance_payment` | Configured cash/bank account against student receivable | Payment cancel/refund workflow |
| Approved student discount | `STUDENT_DISCOUNT_APPROVED` | Configured discount and receivable mappings | `STUDENT_DISCOUNT_CANCELLED` reversal journal |
| Accounting expense / supplier invoice | `accounting_expense` | Selected expense, input VAT, supplier payable or payment account | Correct/void source; journal reversal preserves history |
| Expense payment | `accounting_expense_payment` | Payable against configured cash/bank account | Source reversal/correction |
| Supplier payment | `supplier_payment` | Supplier payable against configured cash/bank account | Source reversal/correction |
| Goods receipt | `inventory_goods_receipt` / `GOODS_RECEIPT_POSTED` | Inventory control + input VAT against supplier payable | Posted journal is immutable; receipt reversal must reverse its source journal |
| Student books/uniform stock issue | `inventory_cost` | Revenue-category inventory and cost mappings | Stock reversal calls accounting reversal |
| Warehouse transfer | No general-ledger movement | Same owned inventory control account; quantity subledger changes only | Reverse warehouse movement |
| Fixed-asset acquisition | `fixed_asset_acquisition` | Asset category and configured funding/payable account | Asset operational reversal/disposal workflow |
| Monthly depreciation | `fixed_asset_depreciation` | Category depreciation expense and accumulated depreciation | Reversal journal |
| Asset disposal/sale/write-off | `fixed_asset_*` | Configured asset, accumulated depreciation, gain/loss and proceeds accounts | Correct originating disposal transaction |
| Payroll run | `payroll_run` | Configured salary/social-insurance expense and payable accounts | Controlled payroll reversal |
| Payroll payment | `payroll_payment` | Payroll payable against configured cash/bank | Payment reversal |
| Cash/bank transfer | `cash_bank_transfer` | Destination cash/bank debit and source credit | Reversal journal |
| Manual journal | `manual_journal` | User-selected posting-enabled manual accounts | Draft may be edited/deleted; posted entry must be reversed/corrected |

## Reconciliation checks

`ReconciliationService` is report-only and checks unbalanced journals, duplicate sources, invoices/payments without journals, receivables mismatch, trial-balance equality, balance-sheet equality, dashboard balance, VAT, duplicate invoices/notifications, invalid account hierarchy, and students without finance accounts. It never repairs production data automatically.

The account ledger now applies the configured opening balance, prior posted movements, inclusive date boundaries, and current-period transactions. Both `transactions` and the compatibility alias `entries` return the same rows, and every row exposes `balance` plus `runningBalance`.

## Required configuration

The Chart of Accounts must contain active posting accounts for every referenced system key/mapping. Goods receipts specifically require `inventory-main`, `vat-input` when VAT is non-zero, and the selected supplier payable account. Missing mappings stop and roll back the complete operation with `ACCOUNT_MAPPING_MISSING`; they do not create partial stock or journals.
