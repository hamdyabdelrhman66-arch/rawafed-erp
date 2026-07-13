CREATE TABLE "fixed_asset_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "useful_life_months" INTEGER NOT NULL DEFAULT 60,
    "depreciation_method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "declining_rate" DECIMAL(7,4),
    "asset_account_id" UUID NOT NULL,
    "accumulated_depreciation_account_id" UUID NOT NULL,
    "depreciation_expense_account_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_assets" (
    "id" UUID NOT NULL,
    "asset_code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cost_center_id" UUID,
    "supplier_id" UUID,
    "purchase_date" DATE NOT NULL,
    "purchase_invoice" TEXT,
    "purchase_cost" DECIMAL(14,2) NOT NULL,
    "residual_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "depreciation_method" TEXT NOT NULL,
    "declining_rate" DECIMAL(7,4),
    "current_book_value" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "custodian" TEXT,
    "location" TEXT,
    "barcode" TEXT,
    "warranty_ends_at" DATE,
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "acquisition_journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_depreciation" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accumulated_amount" DECIMAL(14,2) NOT NULL,
    "book_value_after" DECIMAL(14,2) NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_asset_depreciation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_transfers" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "transfer_date" DATE NOT NULL,
    "from_branch_id" UUID NOT NULL,
    "to_branch_id" UUID NOT NULL,
    "from_location" TEXT,
    "to_location" TEXT,
    "from_custodian" TEXT,
    "to_custodian" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_asset_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_disposals" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "disposal_date" DATE NOT NULL,
    "disposal_type" TEXT NOT NULL,
    "proceeds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "book_value" DECIMAL(14,2) NOT NULL,
    "gain_loss" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "buyer" TEXT,
    "journal_entry_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_asset_disposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_maintenance" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "maintenance_date" DATE NOT NULL,
    "maintenance_type" TEXT NOT NULL,
    "supplier_name" TEXT,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "next_due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_asset_maintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fixed_asset_categories_code_key" ON "fixed_asset_categories"("code");
CREATE INDEX "fixed_asset_categories_active_deleted_at_idx" ON "fixed_asset_categories"("active", "deleted_at");
CREATE UNIQUE INDEX "fixed_assets_asset_code_key" ON "fixed_assets"("asset_code");
CREATE UNIQUE INDEX "fixed_assets_barcode_key" ON "fixed_assets"("barcode");
CREATE UNIQUE INDEX "fixed_assets_acquisition_journal_id_key" ON "fixed_assets"("acquisition_journal_id");
CREATE INDEX "fixed_assets_category_id_status_idx" ON "fixed_assets"("category_id", "status");
CREATE INDEX "fixed_assets_branch_id_status_idx" ON "fixed_assets"("branch_id", "status");
CREATE INDEX "fixed_assets_cost_center_id_idx" ON "fixed_assets"("cost_center_id");
CREATE UNIQUE INDEX "fixed_asset_depreciation_journal_entry_id_key" ON "fixed_asset_depreciation"("journal_entry_id");
CREATE UNIQUE INDEX "fixed_asset_depreciation_asset_id_period_key" ON "fixed_asset_depreciation"("asset_id", "period");
CREATE INDEX "fixed_asset_depreciation_period_idx" ON "fixed_asset_depreciation"("period");
CREATE INDEX "fixed_asset_transfers_asset_id_transfer_date_idx" ON "fixed_asset_transfers"("asset_id", "transfer_date");
CREATE UNIQUE INDEX "fixed_asset_disposals_journal_entry_id_key" ON "fixed_asset_disposals"("journal_entry_id");
CREATE INDEX "fixed_asset_disposals_asset_id_disposal_date_idx" ON "fixed_asset_disposals"("asset_id", "disposal_date");
CREATE INDEX "fixed_asset_maintenance_asset_id_maintenance_date_idx" ON "fixed_asset_maintenance"("asset_id", "maintenance_date");
CREATE INDEX "fixed_asset_maintenance_next_due_date_idx" ON "fixed_asset_maintenance"("next_due_date");

ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fixed_asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "accounting_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_depreciation" ADD CONSTRAINT "fixed_asset_depreciation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_transfers" ADD CONSTRAINT "fixed_asset_transfers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_transfers" ADD CONSTRAINT "fixed_asset_transfers_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_transfers" ADD CONSTRAINT "fixed_asset_transfers_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_disposals" ADD CONSTRAINT "fixed_asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_maintenance" ADD CONSTRAINT "fixed_asset_maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing finance accounts stored VAT in expected_total while their fee item
-- rows contained only the pre-VAT fees. Preserve that amount as an allocatable
-- VAT line so invoices and payments share the same authoritative total.
INSERT INTO "finance_account_fee_items" ("id", "account_id", "name", "amount", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text)::uuid,
       fa."id",
       'VAT',
       ROUND((fa."expected_total" - COALESCE(items.total, 0))::numeric, 2),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "finance_accounts" fa
LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "finance_account_fee_items"
  GROUP BY "account_id"
) items ON items."account_id" = fa."id"
WHERE fa."deleted_at" IS NULL
  AND fa."expected_total" - COALESCE(items.total, 0) > 0.009
  AND NOT EXISTS (
    SELECT 1 FROM "finance_account_fee_items" existing
    WHERE existing."account_id" = fa."id" AND existing."name" = 'VAT'
  );
