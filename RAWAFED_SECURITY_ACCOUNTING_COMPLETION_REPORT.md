# Rawafed ERP — Security, Audit and Journal-Control Completion Report

Date: 16 July 2026  
Scope: Rawafed ERP only. No Global Noyan copy was created.

## Outcome

This release adds a PostgreSQL-backed security and immutable audit layer, server-side session controls, granular permission infrastructure, a bilingual administrator security dashboard, and a professional journal lifecycle. Posted journals are no longer editable in place. A posted-entry correction creates a posted reversal and a new corrected draft, and links both records to the original journal.

No production data was reset or deleted. All three migrations were additive and were applied with `prisma migrate deploy`.

## Accounting root cause and source of truth

The previous zero/incorrect-balance behavior was caused by incomplete or invalid operational journal postings and by report queries that did not consistently represent reversed journals. PostgreSQL journal entries and journal lines remain the accounting source of truth. The Trial Balance, ledgers and account balances use only accounting-impacting statuses: `POSTED` and the preserved original entries marked `REVERSED`; drafts, submitted, approved and cancelled journals do not affect balances.

Operational invoice/payment/expense/payroll/inventory/fixed-asset flows already posted journals in the existing Rawafed implementation. This release preserves those flows and adds common journal metadata, source linking, idempotency support, approval controls and correction safety.

## Database changes

Applied migrations:

- `20260716010000_security_audit_layer`
- `20260716020000_journal_workflow`
- `20260716030000_audit_timestamp_default`

Security models added:

- Permissions and role-permission links
- Server-side security sessions
- Login attempts
- Security alerts and settings
- Trusted devices
- Password history and password-reset token storage
- MFA recovery-code storage
- Data-export audit records

Audit records now retain user/role/branch snapshots, session, request, IP and device context, old/new values, changed fields, risk, source and a hash chain. A PostgreSQL trigger rejects updates and deletes to `audit_logs`. Sensitive fields are redacted or masked, including credentials/tokens, national ID, phone, email, IBAN and bank-account-like data.

Journal models now support `DRAFT`, `SUBMITTED`, `APPROVED`, `POSTED`, `REVERSED` and `CANCELLED`, plus journal date, source module/transaction/event, idempotency key, automatic/manual type, notes, attachment, currency/exchange rate, recurring flag, creator/approver/poster, reversal links, correction links and mandatory correction reason. Accounting periods support `OPEN`, `SOFT_CLOSED` and `CLOSED`.

## Journal controls

- Draft journals can be created and edited and must contain at least two balanced lines.
- Each line must contain either a positive debit or a positive credit.
- Accounts must be active, postable and allowed for manual journals.
- Submission, approval, posting and cancellation use explicit state transitions.
- Maker-checker enforcement applies when segregation of duties is enabled.
- Closed periods reject posting, reversal and correction; soft-closed periods require an elevated finance role.
- Posted journal lines cannot be overwritten through the service or API.
- Correct Entry creates an opposite posted reversal, marks the original as reversed, creates a linked corrected draft, retains the original lines, stores the mandatory reason and emits high-risk audit records.
- Automatic journal corrections require explicit accounting-only authorization and warn the user to correct the operational source first.
- Draft cancellation retains the journal as `CANCELLED`; it is not physically deleted.

Granular journal permissions were added for view, manual create, draft edit, submit, approve, post, reverse, correct, cancel, print, export, source viewing, audit viewing and period management.

## Security controls implemented

- Access JWT lifetime reduced to 15 minutes.
- Server-side sessions with idle and absolute expiry.
- Refresh-token rotation, token families and reuse detection.
- Session/token revocation on password, role or permission changes.
- Generic invalid-login response and login-attempt tracking.
- Configurable failed-login lockout and administrator unlock.
- Password length/complexity/common-password/reuse validation for managed password operations.
- Explicit CORS allowlist, content-type checks, request limits, secure headers, upload MIME/size controls and correlation IDs.
- Global mutation/sensitive-read audit middleware.
- Database-level immutable audit protection and integrity verification.
- Security overview, audit log, sessions, attempts, permissions, alerts, settings, devices and exports APIs.
- Bilingual Arabic/English Security & Audit module and professional journal UI.
- Docker Compose no longer contains fixed development database/JWT secrets; they are required environment variables.

## Reconciliation result

The production-safe report-only reconciliation returned:

- Unbalanced journals: 0
- Duplicate journal sources: 0
- Invoices without journals: 0
- Payments without journals: 0
- Duplicate invoices: 0
- Invalid account hierarchy records: 0
- Students without finance accounts: 0
- Accounts-receivable ledger: SAR 14,195
- Open-invoice receivable: SAR 14,195
- AR difference: SAR 0
- Trial Balance mismatch: false
- Balance Sheet mismatch: false

No repair or backfill was needed or applied.

## Mahmoud Yasser verification

- Registration: `RAW-2026-000127`
- Invoice: `INV-AUTO-1783969169313-7d9ea983`
- Subtotal: SAR 20,500
- VAT: SAR 0
- Invoice total: SAR 20,500
- Paid: SAR 10,250
- Outstanding: SAR 10,250
- AR account: `1200-06760f8f — AR - mahmoud yasser`
- Invoice journal: `JE-2026-00000006`, posted and balanced
- Payment journal: `JE-2026-00000007`, posted and balanced
- Reversal/correction journals: none
- Ledger/AR closing balance: SAR 10,250

## Verification performed

- Prisma format, validation and client generation: passed.
- Backend TypeScript build: passed.
- Angular production build: passed.
- New journal correction integration test: passed.
- New security masking/hash and database immutability tests: passed.
- Full backend suite first pass: 84 of 92 tests passed. Seven failures were obsolete expectations that queried only `POSTED` after originals began retaining `REVERSED` status; one expected physical draft deletion. Those assertions were updated to the new accounting policy.
- The focused re-run of the two updated legacy integration files was interrupted by repeated Neon connection closures/timeouts. This is recorded as an infrastructure verification gap, not reported as a pass.
- Audit integrity verification: 140 records checked, 0 invalid.
- Browser: authenticated shell, Arabic sidebar, Security Overview, live security metrics, audit-integrity status and Journal UI verified. The Journal screen showed 7 posted automatic journals and the bilingual draft/state actions.
- Temporary browser test user was disabled and all of its sessions/refresh tokens were revoked after verification.

## Dependency and code review results

- Backend production dependency audit: 0 vulnerabilities.
- Frontend production dependency audit: 2 moderate findings inherited through `exceljs -> uuid`; the proposed automated fix downgrades `exceljs` across a breaking boundary, so it was not applied without compatibility work.
- Secret scan found no private keys, cloud keys or production connection strings after Docker Compose hardening.
- Remaining reviewed hotspots: report export uses generated `innerHTML`, and registration preview uses Angular `bypassSecurityTrustResourceUrl`. Both should receive a dedicated content-safety test before being considered fully hardened.

## Remaining risks and recommended next actions

High priority:

- Complete end-user password change/reset APIs and UI, including current-password verification and single-use reset delivery.
- Complete TOTP enrollment, verification, recovery-code workflows and mandatory MFA enforcement for privileged roles. Schema/encryption primitives exist, but the full user flow is not yet enabled.
- Apply granular permission middleware and branch/record-scope checks to every legacy business endpoint; the new security and journal endpoints are protected, but this is not yet a complete application-wide endpoint matrix.
- Move browser refresh tokens from application-managed web storage to Secure, HttpOnly cookies with an explicit CSRF design.

Medium priority:

- Enforce maximum concurrent sessions and trusted-device/new-device alert policy during login.
- Add data-export registration to every existing PDF/Excel/CSV action and add spreadsheet formula-injection tests.
- Add malware-scanner integration for uploaded documents.
- Re-run the two connection-interrupted legacy integration files against a dedicated non-pooled test database.
- Resolve the moderate `exceljs/uuid` dependency finding after export regression testing.

Low priority:

- Add saved filters, PDF/Excel export and richer charts to all Security & Audit tabs.
- Add project/department/tax-code journal-line dimensions when those master-data modules are available.

This report does not claim that Rawafed is “fully secure” or “100% secure.” It records the controls implemented and the remaining work explicitly.
