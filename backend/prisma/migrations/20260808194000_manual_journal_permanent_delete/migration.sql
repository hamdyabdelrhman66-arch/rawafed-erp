INSERT INTO "permissions" ("code", "module", "description")
VALUES ('journals.delete.permanent', 'journals', 'Permanently delete manual journals')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'journals.delete.permanent'
WHERE r."name" IN ('Super Admin', 'Finance Manager', 'Chief Accountant', 'Finance', 'Accountant')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'journals.post'
WHERE r."name" IN ('Finance', 'Accountant')
ON CONFLICT DO NOTHING;
