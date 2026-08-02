CREATE TYPE "StudentDiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "StudentDiscountStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "student_discounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "idempotency_key" TEXT NOT NULL,
  "student_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "invoice_id" UUID,
  "academic_year_id" UUID,
  "branch_id" UUID NOT NULL,
  "discount_type" "StudentDiscountType" NOT NULL,
  "discount_value" DECIMAL(14,4) NOT NULL,
  "calculated_amount" DECIMAL(14,2) NOT NULL,
  "base_amount" DECIMAL(14,2) NOT NULL,
  "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "effective_date" DATE NOT NULL,
  "status" "StudentDiscountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "source" TEXT NOT NULL DEFAULT 'PAYMENT_PAGE',
  "approval_reference" TEXT,
  "credit_note_number" TEXT,
  "payment_id" UUID,
  "requested_by_id" UUID,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3),
  "rejected_by_id" UUID,
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "cancelled_by_id" UUID,
  "cancelled_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "journal_entry_id" UUID,
  "reversal_journal_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_discounts_positive_value" CHECK ("discount_value" > 0),
  CONSTRAINT "student_discounts_positive_amount" CHECK ("calculated_amount" > 0),
  CONSTRAINT "student_discounts_percentage_range" CHECK ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
);

CREATE UNIQUE INDEX "student_discounts_idempotency_key_key" ON "student_discounts"("idempotency_key");
CREATE UNIQUE INDEX "student_discounts_credit_note_number_key" ON "student_discounts"("credit_note_number");
CREATE UNIQUE INDEX "student_discounts_journal_entry_id_key" ON "student_discounts"("journal_entry_id");
CREATE UNIQUE INDEX "student_discounts_reversal_journal_id_key" ON "student_discounts"("reversal_journal_id");
CREATE INDEX "student_discounts_student_id_status_effective_date_idx" ON "student_discounts"("student_id", "status", "effective_date");
CREATE INDEX "student_discounts_account_id_status_idx" ON "student_discounts"("account_id", "status");
CREATE INDEX "student_discounts_invoice_id_status_idx" ON "student_discounts"("invoice_id", "status");
CREATE INDEX "student_discounts_branch_id_academic_year_id_idx" ON "student_discounts"("branch_id", "academic_year_id");

ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "finance_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "finance_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_reversal_journal_id_fkey" FOREIGN KEY ("reversal_journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("code", "module", "description") VALUES
('student_discount.create', 'finance', 'Create student discount requests'),
('student_discount.approve', 'finance', 'Approve student discounts'),
('student_discount.cancel', 'finance', 'Cancel approved student discounts'),
('student_discount.view', 'finance', 'View student discounts')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin' AND p."code" LIKE 'student_discount.%'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Finance' AND p."code" IN ('student_discount.create', 'student_discount.view')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" IN ('Finance Manager', 'Chief Accountant') AND p."code" LIKE 'student_discount.%'
ON CONFLICT DO NOTHING;
