CREATE TABLE "notification_reads" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_reads_notification_id_user_id_key"
ON "notification_reads"("notification_id", "user_id");

CREATE INDEX "notification_reads_user_id_read_at_idx"
ON "notification_reads"("user_id", "read_at");

ALTER TABLE "notification_reads"
ADD CONSTRAINT "notification_reads_notification_id_fkey"
FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_reads"
ADD CONSTRAINT "notification_reads_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
