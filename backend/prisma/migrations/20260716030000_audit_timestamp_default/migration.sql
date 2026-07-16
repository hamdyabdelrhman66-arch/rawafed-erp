-- Audit records are append-only, so updated_at is a creation-time compatibility
-- column retained from the legacy table and must be populated by PostgreSQL.
ALTER TABLE "audit_logs"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
