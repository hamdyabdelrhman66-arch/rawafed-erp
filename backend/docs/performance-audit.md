# Performance audit

No production dataset or PostgreSQL test target was available, so this is a static audit, not a measured baseline.

Implemented foundations include indexed business numbers/foreign keys/status dates, bounded pagination in core repositories, compressed HTTP output, pooled Neon-compatible `DATABASE_URL`, query-count/database-time request metrics, request timeouts, and immutable upload caching.

Critical recommendations:

1. Capture p50/p95/p99 latency and query counts for dashboard, trial balance, ledger, invoices, payments, student search, inventory valuation, and exports using production-scale anonymized data.
2. Replace in-memory filtering in notification, supplier-aging, reconciliation, and report services with bounded SQL aggregation.
3. Add cursor pagination and server-side filtering/sorting to all accounting/inventory lists; several compatibility endpoints still load full collections.
4. Materialize or cache only immutable/period-closed statement results. Invalidate by journal posting date and branch.
5. Stream CSV/PDF exports and backups; never assemble large exports in process memory.
6. Review every Prisma `include` using query metrics and remove unused relations. Add compound indexes from actual `EXPLAIN (ANALYZE, BUFFERS)` results.
7. Use Neon's pooled URL for runtime and direct URL for migrations. Set connection/time limits explicitly and test cold starts.
8. Establish budgets: API p95 under 500 ms, dashboards under 1.5 s, exports begin streaming under 2 s, error rate under 0.5%, and no endpoint above 50 queries.

Performance approval is blocked until a reproducible load test with realistic users, invoices, journal lines, movements, and reports is recorded.
