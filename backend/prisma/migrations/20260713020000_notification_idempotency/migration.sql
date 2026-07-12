ALTER TABLE "notifications"
ADD COLUMN "source_type" TEXT,
ADD COLUMN "event_type" TEXT,
ADD COLUMN "target_role" TEXT,
ADD COLUMN "message_key" TEXT,
ADD COLUMN "parameters" JSONB;

CREATE UNIQUE INDEX "notifications_source_type_source_id_event_type_target_role_key"
ON "notifications"("source_type", "source_id", "event_type", "target_role");
