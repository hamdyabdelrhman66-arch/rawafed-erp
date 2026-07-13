ALTER TABLE "users"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "employee_code" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "job_title" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");
CREATE INDEX "users_department_active_idx" ON "users"("department", "active");
