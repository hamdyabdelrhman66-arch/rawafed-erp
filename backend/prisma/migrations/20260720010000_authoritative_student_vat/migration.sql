ALTER TABLE "finance_account_fee_items"
  ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "tax_reason" TEXT;

ALTER TABLE "finance_invoices"
  ADD COLUMN "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "parent_payable" DECIMAL(14,2),
  ADD COLUMN "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "tax_reason" TEXT,
  ADD COLUMN "tax_decision" JSONB;

ALTER TABLE "invoice_lines"
  ADD COLUMN "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "tax_reason" TEXT;

ALTER TABLE "revenue_category_mappings"
  ADD COLUMN "saudi_tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 15;

UPDATE "revenue_category_mappings"
SET "saudi_tax_treatment" = 'GOVERNMENT_BORNE'
WHERE "category" IN ('REGISTRATION', 'TUITION');

INSERT INTO "chart_of_accounts"
  ("id", "code", "name", "name_ar", "type", "normal_balance", "system", "system_key", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), '1155', 'Government VAT Receivable', 'ضريبة قيمة مضافة مستحقة من الدولة', 'ASSET', 'DEBIT', TRUE, 'government-vat-receivable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Existing transactions remain unchanged. This migration only enables new
-- authoritative decisions; historical review is performed through the dry-run report.
