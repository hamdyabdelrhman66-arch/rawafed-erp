ALTER TABLE "chart_of_accounts"
ADD COLUMN "normal_balance" TEXT NOT NULL DEFAULT 'DEBIT',
ADD COLUMN "allow_posting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allow_manual_journal" BOOLEAN NOT NULL DEFAULT true;

UPDATE "chart_of_accounts"
SET "normal_balance" = CASE
  WHEN "type" IN ('ASSET', 'EXPENSE') THEN 'DEBIT'
  ELSE 'CREDIT'
END;
