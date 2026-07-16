-- Professional journal workflow and accounting-period controls.
ALTER TYPE "JournalStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "JournalStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "JournalStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "journal_entries"
  ADD COLUMN "journal_date" DATE,
  ADD COLUMN "source_module" TEXT,
  ADD COLUMN "source_transaction_number" TEXT,
  ADD COLUMN "posting_event_type" TEXT,
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "attachment_url" TEXT,
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
  ADD COLUMN "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" UUID,
  ADD COLUMN "posted_by_id" UUID,
  ADD COLUMN "corrected_from_id" UUID,
  ADD COLUMN "correction_reason" TEXT;

UPDATE "journal_entries" SET "journal_date" = "posting_date" WHERE "journal_date" IS NULL;
UPDATE "journal_entries" SET "automatic" = (COALESCE("source_type", '') <> 'manual_journal');
UPDATE "journal_entries" SET "posting_event_type" = UPPER(REPLACE(COALESCE("source_type", 'MANUAL_JOURNAL'), ' ', '_'));

CREATE UNIQUE INDEX "journal_entries_idempotency_key_key" ON "journal_entries"("idempotency_key");
CREATE INDEX "journal_entries_source_module_source_id_idx" ON "journal_entries"("source_module", "source_id");
CREATE INDEX "journal_entries_corrected_from_id_idx" ON "journal_entries"("corrected_from_id");
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_corrected_from_id_fkey" FOREIGN KEY ("corrected_from_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "accounting_periods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closed_by_id" UUID,
  "closed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounting_periods_branch_id_starts_at_ends_at_key" ON "accounting_periods"("branch_id", "starts_at", "ends_at");
CREATE INDEX "accounting_periods_branch_id_status_starts_at_ends_at_idx" ON "accounting_periods"("branch_id", "status", "starts_at", "ends_at");
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("code", "module", "description") VALUES
('journals.view','journals','View journal entries'),
('journals.create.manual','journals','Create manual journals'),
('journals.edit.draft','journals','Edit draft journals'),
('journals.submit','journals','Submit journals'),
('journals.approve','journals','Approve journals'),
('journals.post','journals','Post journals'),
('journals.reverse','journals','Reverse posted journals'),
('journals.correct.posted','journals','Correct posted journals'),
('journals.cancel.draft','journals','Cancel draft journals'),
('journals.print','journals','Print journals'),
('journals.export','journals','Export journals'),
('journals.view.source','journals','View source transaction'),
('journals.view.audit','journals','View journal audit history'),
('accounting.periods.manage','journals','Manage accounting periods')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin' AND p."module" = 'journals' ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."code" IN
('journals.view','journals.create.manual','journals.edit.draft','journals.submit','journals.print','journals.view.source')
WHERE r."name" IN ('Finance','Accountant') ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."module" = 'journals'
WHERE r."name" IN ('Finance Manager','Chief Accountant') ON CONFLICT DO NOTHING;
