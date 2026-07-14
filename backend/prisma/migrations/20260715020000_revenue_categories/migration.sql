ALTER TABLE "finance_account_fee_items"
ADD COLUMN "service_category" TEXT NOT NULL DEFAULT 'LEGACY_COMBINED',
ADD COLUMN "subtotal" DECIMAL(14,2),
ADD COLUMN "vat_amount" DECIMAL(14,2);

ALTER TABLE "finance_invoices"
ADD COLUMN "service_category" TEXT NOT NULL DEFAULT 'LEGACY_COMBINED',
ADD COLUMN "cost_center_id" UUID,
ADD COLUMN "branch_id" UUID,
ADD COLUMN "legacy_combined" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE "revenue_category_mappings" (
  "id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "revenue_account_id" UUID NOT NULL,
  "cost_account_id" UUID,
  "receivable_account_id" UUID,
  "inventory_account_id" UUID,
  "cost_center_id" UUID,
  "branch_id" UUID,
  "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revenue_category_mappings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "revenue_category_mappings_category_key" ON "revenue_category_mappings"("category");
CREATE INDEX "revenue_category_mappings_active_category_idx" ON "revenue_category_mappings"("active", "category");

CREATE TABLE "direct_cost_events" (
  "id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "invoice_id" UUID,
  "student_id" UUID,
  "route" TEXT,
  "area" TEXT,
  "event_date" DATE NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_cost_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "direct_cost_events_source_type_source_id_category_key" ON "direct_cost_events"("source_type", "source_id", "category");
CREATE INDEX "direct_cost_events_category_event_date_idx" ON "direct_cost_events"("category", "event_date");
CREATE INDEX "direct_cost_events_student_id_event_date_idx" ON "direct_cost_events"("student_id", "event_date");

INSERT INTO "chart_of_accounts" ("id", "code", "name", "name_ar", "type", "normal_balance", "system", "system_key", "created_at", "updated_at") VALUES
(gen_random_uuid(), '4110', 'Registration Revenue', 'إيرادات التسجيل', 'REVENUE', 'CREDIT', TRUE, 'registration-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '4120', 'Books Revenue', 'إيرادات الكتب', 'REVENUE', 'CREDIT', TRUE, 'books-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '4130', 'Uniform Revenue', 'إيرادات الزي', 'REVENUE', 'CREDIT', TRUE, 'uniform-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '4140', 'Transportation Revenue', 'إيرادات النقل', 'REVENUE', 'CREDIT', TRUE, 'transportation-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '4150', 'Activities Revenue', 'إيرادات الأنشطة', 'REVENUE', 'CREDIT', TRUE, 'activities-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '4190', 'Other Services Revenue', 'إيرادات الخدمات الأخرى', 'REVENUE', 'CREDIT', TRUE, 'other-services-revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '1300', 'Inventory', 'المخزون', 'ASSET', 'DEBIT', TRUE, 'inventory-asset', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '5110', 'Cost of Books Sold', 'تكلفة الكتب المباعة', 'EXPENSE', 'DEBIT', TRUE, 'books-cost', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '5120', 'Cost of Uniform Sold', 'تكلفة الزي المباع', 'EXPENSE', 'DEBIT', TRUE, 'uniform-cost', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '5130', 'Transportation Costs', 'تكاليف النقل', 'EXPENSE', 'DEBIT', TRUE, 'transportation-cost', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), '5140', 'Activity Costs', 'تكاليف الأنشطة', 'EXPENSE', 'DEBIT', TRUE, 'activities-cost', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO "revenue_category_mappings" ("id", "category", "revenue_account_id", "cost_account_id", "receivable_account_id", "inventory_account_id", "tax_treatment", "created_at", "updated_at")
SELECT gen_random_uuid(), values.category, revenue.id, cost.id, receivable.id, inventory.id, 'STANDARD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('REGISTRATION', 'registration-revenue', NULL),
  ('TUITION', 'tuition-revenue', NULL),
  ('BOOKS', 'books-revenue', 'books-cost'),
  ('UNIFORM', 'uniform-revenue', 'uniform-cost'),
  ('TRANSPORTATION', 'transportation-revenue', 'transportation-cost'),
  ('ACTIVITIES', 'activities-revenue', 'activities-cost'),
  ('OTHER_SERVICES', 'other-services-revenue', NULL)
) AS values(category, revenue_key, cost_key)
JOIN "chart_of_accounts" revenue ON revenue."system_key" = values.revenue_key
LEFT JOIN "chart_of_accounts" cost ON cost."system_key" = values.cost_key
LEFT JOIN "chart_of_accounts" receivable ON receivable."system_key" = 'accounts-receivable'
LEFT JOIN "chart_of_accounts" inventory ON inventory."system_key" = 'inventory-asset'
ON CONFLICT ("category") DO NOTHING;
