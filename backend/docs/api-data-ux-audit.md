# API, data integrity, and UX audit

## API

The legacy server exposes 107 routes. Existing URLs remain unchanged. PostgreSQL core routes have centralized error wrapping, active-session checks, role checks, pagination bounds on primary lists, and improved mutation validators. The legacy SQLite surface has only 35 explicit `safeParse` sites, so validation coverage is incomplete. The OpenAPI file is a baseline rather than a full contract. Versioning readiness is acceptable through the `/api` prefix but no `/v1` compatibility policy exists. Idempotency is strong for journals/events/business numbers but not uniformly exposed through request idempotency headers. Timeout and 2 MiB JSON limits are enforced; upload limit remains 20 MiB.

Required before cutover: enumerate all routes into OpenAPI, attach request/query/response schemas, run generated negative tests, verify status/error compatibility, and confirm pagination/filtering/sorting for every unbounded collection.

## Data integrity

Prisma foreign keys and unique constraints cover registrations, students, finance accounts, invoices, receipts, payment allocations, journal sources, stock keys, movement sources, purchasing documents, transfers, and accounting events. Services check balanced journals and non-negative stock.

No live PostgreSQL integrity audit was possible. Therefore orphan records, duplicate business numbers, negative balances/stock, accounting equations, AR/AP/VAT/cash, dashboard, and inventory reconciliation are all cutover FAIL until executed against the production candidate. Historical records must receive correction reports and approved reversals—never automatic mutation.

## UX and accessibility

Static inventory found 60 Angular templates, 230 buttons, and 299 label/ARIA occurrences. Arabic/English assets and RTL support exist, as do many empty states. Only two files contain explicit loading-state markers, suggesting inconsistent asynchronous feedback. This was not a browser-based WCAG assessment.

Required testing includes keyboard-only navigation, focus trapping/restoration, accessible names, validation announcements, contrast, zoom/reflow, RTL dropdown/dialog/table positioning, responsive layouts, loading/error/empty states, toasts, destructive confirmation, long Arabic strings, PDF/Excel Arabic output, and print layout. Dark-mode readiness is not demonstrated and is non-blocking unless included in the supported product requirements.
