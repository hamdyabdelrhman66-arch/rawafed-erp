CREATE TYPE "VatAccountingBasis" AS ENUM ('INVOICE_ACCRUAL', 'CASH');
CREATE TYPE "FinanceDocumentType" AS ENUM ('FEE_AGREEMENT', 'TAX_INVOICE', 'PAYMENT_RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE');
CREATE TYPE "FinanceDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID', 'SUPERSEDED');
CREATE TYPE "TaxEventType" AS ENUM ('INVOICE_ISSUED', 'PAYMENT_COLLECTED', 'CREDIT_NOTE', 'DEBIT_NOTE', 'REFUND', 'VOID');
CREATE TYPE "TaxEventStatus" AS ENUM ('INFORMATIONAL', 'RECOGNIZED', 'REVERSED', 'VOID');

ALTER TABLE "finance_invoices"
  ADD COLUMN "document_type" "FinanceDocumentType" NOT NULL DEFAULT 'TAX_INVOICE',
  ADD COLUMN "workflow_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "fee_agreement_id" UUID;

ALTER TABLE "finance_payments" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "finance_payments" ADD COLUMN "installment_id" UUID;

ALTER TABLE "payment_fee_allocations"
  ADD COLUMN "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "payment_allocations"
  ADD COLUMN "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "installments"
  ADD COLUMN "finance_account_id" UUID,
  ADD COLUMN "fee_agreement_id" UUID,
  ADD COLUMN "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "finance_document_sequences" (
  "id" UUID NOT NULL,
  "document_type" "FinanceDocumentType" NOT NULL,
  "year" INTEGER NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_agreements" (
  "id" UUID NOT NULL,
  "agreement_number" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "academic_year_id" UUID,
  "branch_id" UUID,
  "base_fees" DECIMAL(14,2) NOT NULL,
  "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expected_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "parent_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "contract_total" DECIMAL(14,2) NOT NULL,
  "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  "status" "FinanceDocumentStatus" NOT NULL DEFAULT 'ISSUED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "terms" TEXT,
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_agreement_lines" (
  "id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "fee_item_id" UUID,
  "description" TEXT NOT NULL,
  "service_category" TEXT NOT NULL,
  "base_amount" DECIMAL(14,2) NOT NULL,
  "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "expected_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "parent_payable" DECIMAL(14,2) NOT NULL,
  "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_agreement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_receipts" (
  "id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "payment_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "fee_agreement_id" UUID,
  "amount_received" DECIMAL(14,2) NOT NULL,
  "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "parent_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance_before" DECIMAL(14,2) NOT NULL,
  "balance_after" DECIMAL(14,2) NOT NULL,
  "total_paid_before" DECIMAL(14,2) NOT NULL,
  "total_paid_after" DECIMAL(14,2) NOT NULL,
  "status" "FinanceDocumentStatus" NOT NULL DEFAULT 'ISSUED',
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issued_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_events" (
  "id" UUID NOT NULL,
  "event_number" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "fee_agreement_id" UUID,
  "invoice_id" UUID,
  "payment_id" UUID,
  "receipt_id" UUID,
  "accounting_basis" "VatAccountingBasis" NOT NULL,
  "event_type" "TaxEventType" NOT NULL,
  "status" "TaxEventStatus" NOT NULL DEFAULT 'RECOGNIZED',
  "recognition_date" DATE NOT NULL,
  "taxable_amount" DECIMAL(14,2) NOT NULL,
  "parent_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "government_borne_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "tax_treatment" TEXT NOT NULL DEFAULT 'STANDARD',
  "source_version" INTEGER NOT NULL DEFAULT 2,
  "journal_entry_id" UUID,
  "reversal_of_id" UUID,
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_document_sequences_document_type_year_key" ON "finance_document_sequences"("document_type", "year");
CREATE UNIQUE INDEX "fee_agreements_agreement_number_key" ON "fee_agreements"("agreement_number");
CREATE INDEX "fee_agreements_account_id_status_idx" ON "fee_agreements"("account_id", "status");
CREATE INDEX "fee_agreements_academic_year_id_branch_id_idx" ON "fee_agreements"("academic_year_id", "branch_id");
CREATE INDEX "fee_agreement_lines_agreement_id_idx" ON "fee_agreement_lines"("agreement_id");
CREATE UNIQUE INDEX "finance_payments_idempotency_key_key" ON "finance_payments"("idempotency_key");
CREATE INDEX "finance_payments_installment_id_idx" ON "finance_payments"("installment_id");
CREATE UNIQUE INDEX "payment_receipts_receipt_number_key" ON "payment_receipts"("receipt_number");
CREATE UNIQUE INDEX "payment_receipts_payment_id_key" ON "payment_receipts"("payment_id");
CREATE INDEX "payment_receipts_account_id_issued_at_idx" ON "payment_receipts"("account_id", "issued_at");
CREATE UNIQUE INDEX "tax_events_event_number_key" ON "tax_events"("event_number");
CREATE UNIQUE INDEX "tax_events_event_type_invoice_id_payment_id_key" ON "tax_events"("event_type", "invoice_id", "payment_id");
CREATE INDEX "tax_events_recognition_date_status_accounting_basis_idx" ON "tax_events"("recognition_date", "status", "accounting_basis");
CREATE INDEX "tax_events_account_id_recognition_date_idx" ON "tax_events"("account_id", "recognition_date");
CREATE INDEX "tax_events_invoice_id_idx" ON "tax_events"("invoice_id");
CREATE INDEX "tax_events_payment_id_idx" ON "tax_events"("payment_id");
CREATE INDEX "finance_invoices_fee_agreement_id_idx" ON "finance_invoices"("fee_agreement_id");
CREATE INDEX "installments_finance_account_id_due_date_status_idx" ON "installments"("finance_account_id", "due_date", "status");

ALTER TABLE "finance_invoices" ADD CONSTRAINT "finance_invoices_fee_agreement_id_fkey" FOREIGN KEY ("fee_agreement_id") REFERENCES "fee_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_agreements" ADD CONSTRAINT "fee_agreements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_agreements" ADD CONSTRAINT "fee_agreements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fee_agreement_lines" ADD CONSTRAINT "fee_agreement_lines_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "fee_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "finance_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_fee_agreement_id_fkey" FOREIGN KEY ("fee_agreement_id") REFERENCES "fee_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_fee_agreement_id_fkey" FOREIGN KEY ("fee_agreement_id") REFERENCES "fee_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "finance_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "finance_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "tax_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_finance_account_id_fkey" FOREIGN KEY ("finance_account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_fee_agreement_id_fkey" FOREIGN KEY ("fee_agreement_id") REFERENCES "fee_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
