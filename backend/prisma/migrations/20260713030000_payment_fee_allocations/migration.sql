CREATE TABLE "payment_fee_allocations" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "fee_item_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_fee_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_fee_allocations_payment_id_fee_item_id_key"
ON "payment_fee_allocations"("payment_id", "fee_item_id");
CREATE INDEX "payment_fee_allocations_fee_item_id_idx"
ON "payment_fee_allocations"("fee_item_id");

ALTER TABLE "payment_fee_allocations"
ADD CONSTRAINT "payment_fee_allocations_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "finance_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_fee_allocations"
ADD CONSTRAINT "payment_fee_allocations_fee_item_id_fkey"
FOREIGN KEY ("fee_item_id") REFERENCES "finance_account_fee_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
