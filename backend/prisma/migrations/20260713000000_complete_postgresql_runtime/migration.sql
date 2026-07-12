-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "profile" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Posted',
    "gross_total" DECIMAL(14,2) NOT NULL,
    "deductions_total" DECIMAL(14,2) NOT NULL,
    "employer_gosi_total" DECIMAL(14,2) NOT NULL,
    "net_total" DECIMAL(14,2) NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_name" TEXT NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "housing_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportation_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "absence_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "late_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loan_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gosi_employee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gosi_employer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_journal_entry_id_key" ON "payroll_runs"("journal_entry_id");

-- CreateIndex
CREATE INDEX "payroll_runs_payment_date_status_idx" ON "payroll_runs"("payment_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_period_status_key" ON "payroll_runs"("period", "status");

-- CreateIndex
CREATE INDEX "payroll_lines_employee_id_idx" ON "payroll_lines"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_payroll_run_id_employee_id_key" ON "payroll_lines"("payroll_run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
