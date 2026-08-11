INSERT INTO "permissions" ("code", "module", "description")
VALUES
  ('journals.create.manual', 'journals', 'Create manual journal entries'),
  ('journals.post', 'journals', 'Post journal entries'),
  ('journals.delete.permanent', 'journals', 'Permanently delete journals and supported linked financial documents')
ON CONFLICT ("code") DO UPDATE SET "module" = EXCLUDED."module";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Finance Manager', 'Chief Accountant', 'Finance', 'Accountant')
  AND p."code" IN ('journals.create.manual', 'journals.post', 'journals.delete.permanent')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
