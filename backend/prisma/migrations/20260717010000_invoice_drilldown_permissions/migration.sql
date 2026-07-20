INSERT INTO "permissions" ("code", "module", "description") VALUES
('finance.invoices.print', 'finance', 'Print invoices'),
('finance.invoices.exportPdf', 'finance', 'Export invoice PDF'),
('finance.receipts.view', 'finance', 'View payment receipts'),
('finance.journals.view', 'finance', 'View invoice journal links')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'Super Admin'
  AND p."code" IN ('finance.invoices.view', 'finance.invoices.print', 'finance.invoices.exportPdf', 'finance.receipts.view', 'finance.journals.view')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('finance.invoices.view', 'finance.invoices.print', 'finance.invoices.exportPdf', 'finance.receipts.view', 'finance.journals.view')
WHERE r."name" IN ('Finance', 'Finance Manager', 'Chief Accountant', 'Accountant')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('finance.invoices.view', 'finance.invoices.print', 'finance.invoices.exportPdf', 'finance.journals.view')
WHERE r."name" = 'Auditor'
ON CONFLICT DO NOTHING;
