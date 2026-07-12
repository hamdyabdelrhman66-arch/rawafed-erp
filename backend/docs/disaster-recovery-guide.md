# Disaster recovery guide

## Targets

- Target RPO: 24 hours initially; 1 hour for finance after automated Neon PITR/backup verification.
- Target RTO: 4 hours.
- Retention: daily 30 days, weekly 12 weeks, monthly 7 years where finance/legal policy requires it.
- Keep at least one encrypted copy in a separate account/region.

## Backup

Run `npm run backup:database`. PostgreSQL backups use `pg_dump` custom format, validate with `pg_restore --list`, and write a SHA-256 sidecar. SQLite fallback backups copy the database atomically enough only while writes are stopped; maintenance mode is required.

## Restore drill

1. Provision an empty isolated database.
2. Set `RESTORE_FILE`, `RESTORE_CONFIRMATION=RESTORE_RAWAFED_DATA`, the target `DATABASE_URL`, and `PERSISTENCE_DRIVER=postgres`.
3. Run `npm run restore:database`.
4. Apply only migrations newer than the restored backup.
5. Run readiness, migration-count, authentication, reconciliation, orphan, duplicate, AR/AP/VAT/cash, and inventory tests.
6. Record duration, restored row counts, checksum, approver, and exceptions. Never restore directly over production as the first test.

## Incident rollback

Stop writes, preserve logs and a final backup, identify the last known-good migration/build, restore to a new database, validate, then switch the secret/connection atomically. Application rollback must not run destructive down migrations. Escalate any finance discrepancy to Finance Manager and Auditor before reopening writes.

Quarterly restore drills are mandatory; an untested backup is not considered a backup.
