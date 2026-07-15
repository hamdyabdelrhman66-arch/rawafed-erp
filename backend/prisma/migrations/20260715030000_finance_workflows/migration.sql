ALTER TABLE "finance_invoices"
ADD COLUMN "discount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "invoice_sequences" (
  "id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoice_sequences_category_year_key" ON "invoice_sequences"("category", "year");

ALTER TABLE "installment_plans"
ADD COLUMN "reminder_days" JSONB NOT NULL DEFAULT '[7,3,1,0]',
ADD COLUMN "duplicate_due_dates" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "installments" ADD COLUMN "notes" TEXT;

ALTER TABLE "accounting_expenses"
ADD COLUMN "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "due_date" DATE,
ADD COLUMN "branch_id" UUID,
ADD COLUMN "reference_number" TEXT,
ADD COLUMN "vat_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "attachment_url" TEXT,
ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "created_by_id" UUID;
UPDATE "accounting_expenses" SET "paid_amount" = "total_amount" WHERE LOWER("payment_status") = 'paid';

CREATE TABLE "accounting_expense_payments" (
  "id" UUID NOT NULL,
  "expense_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "payment_date" DATE NOT NULL,
  "payment_method" TEXT NOT NULL,
  "payment_account_id" UUID NOT NULL,
  "reference_number" TEXT,
  "journal_entry_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_expense_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "accounting_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "accounting_expense_payments_journal_entry_id_key" ON "accounting_expense_payments"("journal_entry_id");
CREATE UNIQUE INDEX "accounting_expense_payments_idempotency_key_key" ON "accounting_expense_payments"("idempotency_key");
CREATE INDEX "accounting_expense_payments_expense_id_payment_date_idx" ON "accounting_expense_payments"("expense_id", "payment_date");

ALTER TABLE "payroll_lines"
ADD COLUMN "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "payment_date" DATE,
ADD COLUMN "payment_method" TEXT,
ADD COLUMN "payment_reference" TEXT;

CREATE TABLE "payroll_payments" (
  "id" UUID NOT NULL,
  "payroll_run_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "payment_date" DATE NOT NULL,
  "payment_method" TEXT NOT NULL,
  "payment_account_id" UUID NOT NULL,
  "reference_number" TEXT,
  "employee_ids" JSONB NOT NULL DEFAULT '[]',
  "journal_entry_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_payments_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_payments_journal_entry_id_key" ON "payroll_payments"("journal_entry_id");
CREATE UNIQUE INDEX "payroll_payments_idempotency_key_key" ON "payroll_payments"("idempotency_key");
CREATE INDEX "payroll_payments_payroll_run_id_payment_date_idx" ON "payroll_payments"("payroll_run_id", "payment_date");
