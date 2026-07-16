-- Rawafed security and immutable audit layer. Additive migration only.
ALTER TABLE "users"
  ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" TIMESTAMP(3),
  ADD COLUMN "password_changed_at" TIMESTAMP(3),
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfa_secret_encrypted" TEXT;

ALTER TABLE "refresh_tokens"
  ADD COLUMN "session_id" UUID,
  ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "replaced_by_id" UUID;

ALTER TABLE "audit_logs"
  ADD COLUMN "username_snapshot" TEXT,
  ADD COLUMN "display_name_snapshot" TEXT,
  ADD COLUMN "role_snapshot" TEXT,
  ADD COLUMN "branch_snapshot" TEXT,
  ADD COLUMN "session_id" UUID,
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "browser" TEXT,
  ADD COLUMN "operating_system" TEXT,
  ADD COLUMN "device_type" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "http_method" TEXT,
  ADD COLUMN "api_endpoint" TEXT,
  ADD COLUMN "frontend_route" TEXT,
  ADD COLUMN "module" TEXT,
  ADD COLUMN "entity_reference" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "old_values" JSONB,
  ADD COLUMN "new_values" JSONB,
  ADD COLUMN "changed_fields" JSONB,
  ADD COLUMN "risk_level" TEXT NOT NULL DEFAULT 'LOW',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WEB',
  ADD COLUMN "impersonator_id" UUID,
  ADD COLUMN "record_hash" TEXT NOT NULL DEFAULT 'legacy-record',
  ADD COLUMN "previous_record_hash" TEXT;

CREATE TABLE "permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_module_code_idx" ON "permissions"("module", "code");

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

CREATE TABLE "security_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idle_expires_at" TIMESTAMP(3) NOT NULL,
  "absolute_expires_at" TIMESTAMP(3) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "browser" TEXT,
  "operating_system" TEXT,
  "device_type" TEXT,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_id" UUID,
  "revocation_reason" TEXT,
  CONSTRAINT "security_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_sessions_user_id_revoked_at_absolute_expires_at_idx" ON "security_sessions"("user_id", "revoked_at", "absolute_expires_at");
CREATE INDEX "security_sessions_last_activity_at_idx" ON "security_sessions"("last_activity_at");

CREATE TABLE "login_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "username_masked" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "failure_reason" TEXT,
  "session_id" UUID,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "browser" TEXT,
  "operating_system" TEXT,
  "device_type" TEXT,
  "request_id" TEXT,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_attempts_created_at_success_idx" ON "login_attempts"("created_at", "success");
CREATE INDEX "login_attempts_user_id_created_at_idx" ON "login_attempts"("user_id", "created_at");
CREATE INDEX "login_attempts_ip_address_created_at_idx" ON "login_attempts"("ip_address", "created_at");

CREATE TABLE "security_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "severity" TEXT NOT NULL,
  "alert_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "user_id" UUID,
  "ip_address" TEXT,
  "device" TEXT,
  "related_audit_ids" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "resolution_notes" TEXT,
  "assigned_to_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_alerts_status_severity_created_at_idx" ON "security_alerts"("status", "severity", "created_at");
CREATE INDEX "security_alerts_user_id_created_at_idx" ON "security_alerts"("user_id", "created_at");

CREATE TABLE "security_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "max_failed_attempts" INTEGER NOT NULL DEFAULT 5,
  "failure_window_minutes" INTEGER NOT NULL DEFAULT 15,
  "lock_duration_minutes" INTEGER NOT NULL DEFAULT 30,
  "idle_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
  "absolute_timeout_hours" INTEGER NOT NULL DEFAULT 12,
  "max_concurrent_sessions" INTEGER NOT NULL DEFAULT 5,
  "minimum_password_length" INTEGER NOT NULL DEFAULT 12,
  "password_history_count" INTEGER NOT NULL DEFAULT 5,
  "require_mfa_privileged" BOOLEAN NOT NULL DEFAULT false,
  "segregation_of_duties" BOOLEAN NOT NULL DEFAULT false,
  "audit_retention_days" INTEGER NOT NULL DEFAULT 2555,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "security_settings" ("id") VALUES ('default') ON CONFLICT DO NOTHING;

CREATE TABLE "trusted_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "fingerprint_hash" TEXT NOT NULL, "device_name" TEXT, "last_ip" TEXT,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL, "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trusted_devices_user_id_fingerprint_hash_key" ON "trusted_devices"("user_id", "fingerprint_hash");
CREATE INDEX "trusted_devices_expires_at_revoked_at_idx" ON "trusted_devices"("expires_at", "revoked_at");

CREATE TABLE "password_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "password_hash" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_used_at_idx" ON "password_reset_tokens"("user_id", "expires_at", "used_at");

CREATE TABLE "mfa_recovery_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL, "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key" ON "mfa_recovery_codes"("user_id", "code_hash");

CREATE TABLE "data_export_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID,
  "report_type" TEXT NOT NULL, "export_format" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}', "record_count" INTEGER NOT NULL DEFAULT 0,
  "branch" TEXT, "ip_address" TEXT, "device" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_export_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "data_export_logs_user_id_created_at_idx" ON "data_export_logs"("user_id", "created_at");
CREATE INDEX "data_export_logs_report_type_created_at_idx" ON "data_export_logs"("report_type", "created_at");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "security_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_export_logs" ADD CONSTRAINT "data_export_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_module_created_at_idx" ON "audit_logs"("module", "created_at");
CREATE INDEX "audit_logs_risk_level_created_at_idx" ON "audit_logs"("risk_level", "created_at");
CREATE INDEX "audit_logs_status_created_at_idx" ON "audit_logs"("status", "created_at");
CREATE INDEX "audit_logs_ip_address_created_at_idx" ON "audit_logs"("ip_address", "created_at");
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");
CREATE INDEX "refresh_tokens_session_id_revoked_at_idx" ON "refresh_tokens"("session_id", "revoked_at");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- Database-level append-only protection. The owner may temporarily disable the
-- trigger only during an explicitly reviewed security migration.
CREATE OR REPLACE FUNCTION rawafed_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION rawafed_reject_audit_mutation();

-- Initial granular permissions. Existing Super Admin receives all controls.
INSERT INTO "permissions" ("code", "module", "description") VALUES
('security.audit.view','security','View audit records'),
('security.audit.export','security','Export audit records'),
('security.sessions.view','security','View sessions'),
('security.sessions.revoke','security','Revoke sessions'),
('security.loginAttempts.view','security','View login attempts'),
('security.settings.manage','security','Manage security settings'),
('security.alerts.manage','security','Manage security alerts'),
('security.permissions.manage','security','Manage role permissions'),
('finance.invoices.view','finance','View invoices'),
('finance.invoices.create','finance','Create invoices'),
('finance.payments.record','finance','Record payments'),
('finance.payments.reverse','finance','Reverse payments'),
('finance.ledger.view','finance','View ledgers'),
('finance.ledger.export','finance','Export ledgers'),
('payroll.view','payroll','View payroll'),
('payroll.process','payroll','Process payroll'),
('payroll.pay','payroll','Pay payroll'),
('students.view','students','View students'),
('students.edit','students','Edit students'),
('reports.view','reports','View reports'),
('reports.export','reports','Export reports')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin' ON CONFLICT DO NOTHING;
