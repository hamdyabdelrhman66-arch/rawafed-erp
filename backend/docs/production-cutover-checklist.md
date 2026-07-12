# Production cutover checklist

No cutover is permitted unless every required item is PASS with dated evidence and approver.

| Gate | Current | Required evidence |
|---|---|---|
| PostgreSQL migration rehearsed | FAIL | Target counts, orphan/duplicate checks, immutable report |
| API contract suite passed | FAIL | All Angular-visible endpoints compared |
| Accounting 20-scenario suite passed | FAIL | PostgreSQL test results and reconciliation |
| Inventory integration suite passed | FAIL | PostgreSQL rollback/concurrency/restart results |
| Trial balance and balance sheet balanced | FAIL | Signed live reconciliation report |
| AR/AP/VAT/cash reconciled | FAIL | Zero-difference control totals |
| Inventory reconciled | FAIL | Stock ledger/count/valuation evidence |
| No orphan or duplicate records | FAIL | Production-candidate integrity query report |
| Critical-service coverage above 90% | FAIL | Coverage report currently records 0% executed statements |
| Full OpenAPI contract complete | FAIL | Valid specification for all routes |
| Security/access-control test passed | FAIL | Role/object matrix and penetration report |
| No known critical vulnerabilities | PASS | `npm audit --omit=dev` reports zero for frontend and backend on 2026-07-12 |
| Hardcoded credentials removed | PASS | Source scan and Phase 5 tests |
| Structured logging enabled | PASS | Runtime JSON log probe |
| Liveness/readiness/health passed | PASS (SQLite only) | Repeat against staging PostgreSQL |
| Backup generated and checksum verified | PASS (SQLite only) | Repeat PostgreSQL dump and restore drill |
| Restore drill passed | FAIL | Isolated PostgreSQL restore and reconciliation |
| Performance baseline recorded | FAIL | Production-scale p50/p95/p99/load report |
| Monitoring and alert routing configured | FAIL | Alert tests and on-call acknowledgement |
| Production environment verified | FAIL | Render/Neon/TLS/secrets review |
| Inventory router activation approved | FAIL | Phase 3 and Phase 4 gates complete |
| Rollback plan approved | PARTIAL | Document exists; rehearsal required |
| Business owners sign off | FAIL | Admissions, Finance, Inventory, IT, DPO approvals |

Current decision: **NO-GO**.
