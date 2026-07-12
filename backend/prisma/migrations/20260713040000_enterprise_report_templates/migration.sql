CREATE TABLE "report_templates" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "report_type" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "columns" JSONB NOT NULL DEFAULT '[]',
  "group_by" TEXT,
  "sort_by" TEXT,
  "chart_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_templates_user_id_name_key" ON "report_templates"("user_id", "name");
CREATE INDEX "report_templates_user_id_report_type_idx" ON "report_templates"("user_id", "report_type");
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
