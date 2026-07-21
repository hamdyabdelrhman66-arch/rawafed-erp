INSERT INTO "settings" ("id", "key", "value", "created_at", "updated_at") VALUES
(gen_random_uuid(), 'addressAr', '"الرياض، حي الخليج، شارع بحر العرب"'::jsonb, NOW(), NOW()),
(gen_random_uuid(), 'addressEn', '"Riyadh, Al Khaleej District, Bahr Al Arab Street"'::jsonb, NOW(), NOW()),
(gen_random_uuid(), 'address', '"Riyadh, Al Khaleej District, Bahr Al Arab Street"'::jsonb, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = NOW();

INSERT INTO "permissions" ("id", "code", "module", "description", "created_at") VALUES
(gen_random_uuid(), 'students.edit.identity', 'students', 'Edit sensitive student identity fields', NOW()),
(gen_random_uuid(), 'students.edit.financeData', 'students', 'Edit finance-related student profile fields', NOW()),
(gen_random_uuid(), 'students.archive', 'students', 'Archive students', NOW()),
(gen_random_uuid(), 'students.restore', 'students', 'Restore archived students', NOW()),
(gen_random_uuid(), 'students.delete', 'students', 'Review student deletion eligibility', NOW()),
(gen_random_uuid(), 'students.delete.permanent', 'students', 'Permanently delete eligible students', NOW()),
(gen_random_uuid(), 'applications.approval.rollback', 'students', 'Roll back an approval with no downstream activity', NOW()),
(gen_random_uuid(), 'students.audit.view', 'students', 'View student change history', NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin'
  AND p."code" IN ('students.edit','students.edit.identity','students.edit.financeData','students.archive','students.restore','students.delete','students.delete.permanent','applications.approval.rollback','students.audit.view','finance.payments.record')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" IN ('Admissions','Registrar','Principal')
  AND p."code" IN ('students.edit','students.archive','students.restore','students.audit.view')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", NOW()
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" IN ('Finance','Finance Manager','Chief Accountant')
  AND p."code" IN ('finance.payments.record','students.view','students.audit.view')
ON CONFLICT DO NOTHING;
