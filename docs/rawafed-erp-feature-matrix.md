# Rawafed ERP Feature Matrix

This matrix tracks the inspected modules and the current implementation status.

| Module                    | Status             | Backend                    | Notes                                                                                         |
| ------------------------- | ------------------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| Admissions / Registration | Partially complete | Connected                  | Existing workflow, PDFs, uploads, approvals, and finance sync preserved.                      |
| Students                  | Partially complete | Connected                  | Existing CRUD preserved.                                                                      |
| Accounting ERP            | Partially complete | Connected                  | Dashboard, COA, journals, ledger, trial balance, AR/AP, cashboxes, banks, suppliers improved. |
| Inventory ERP             | Partially complete | Connected                  | Dashboard, item master, warehouses, categories, purchasing, GRN, reports improved.            |
| HR / Staff                | Partially complete | Connected                  | Existing staff pages reused. Employee master fields expanded.                                 |
| Payroll                   | Partially complete | Connected                  | Existing payroll pages reused. Payroll run API and payroll journal posting added.             |
| Fixed Assets              | Missing            | Missing                    | Chart of Accounts has fixed asset accounts, but no asset lifecycle module yet.                |
| Budgets                   | Missing            | Missing                    | No budget tables/pages found.                                                                 |
| Approval Workflow Engine  | Missing            | Partial hardcoded statuses | Purchase and admission statuses exist, but no reusable engine yet.                            |
| Notifications             | Partially complete | Connected                  | Existing notifications table/API exists; needs preferences, snooze, multi-channel readiness.  |
| Document Center           | Partially complete | Connected uploads          | Uploads exist; reusable document center/versioning missing.                                   |
| Audit Trail               | Partially complete | Connected                  | Central audit table exists; needs richer immutable metadata and UI.                           |
| Dashboards                | Partially complete | Connected                  | Finance, Accounting, Inventory dashboards improved; HR/Owner/Principal need expansion.        |
| Branch / Organization     | Partially complete | Partial fields             | Cost centers exist; branch/project permissions still incomplete.                              |
| Fiscal Control            | Partially complete | Tables exist               | Fiscal years exist; period closing/locks missing.                                             |
| Backup / Restore          | Partially complete | Connected                  | Manual JSON backup exists; restore workflow/metadata missing.                                 |
| Role Permissions          | Partially complete | Role-based                 | Fine-grained permission matrix missing.                                                       |
