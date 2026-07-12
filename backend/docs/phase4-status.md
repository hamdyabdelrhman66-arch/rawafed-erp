# Phase 4 inventory and procurement status

Phase 4 implementation is prepared and deliberately isolated. The PostgreSQL inventory router is **not imported or mounted** by `server.ts`; therefore PostgreSQL mode continues returning HTTP 503 for `/api/inventory/*`. This prevents activation before Phase 3 accounting verification.

## Migrated implementation

- Warehouses and warehouse locations
- Categories and units of measure
- Inventory items for books, uniforms, consumables, and general stock
- Warehouse/location stock balances and stock movements
- Purchase requests, purchase orders, and lines
- Goods receipts and receipt lines
- Suppliers through the normalized accounting supplier master
- Atomic warehouse transfers
- Stock adjustments and inventory-count persistence models
- Inventory settings
- Inventory notifications and audit records
- Typed pending accounting events
- Valuation, movement, low-stock, dead-stock, warehouse, supplier, purchase, book, and uniform reports

## Prisma models

`UnitOfMeasure`, `InventoryCategory`, `Warehouse`, `WarehouseLocation`, `InventoryItem`, `InventoryStock`, `StockMovement`, `PurchaseRequest`, `PurchaseRequestLine`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `StockTransfer`, `StockTransferLine`, `StockAdjustment`, `StockAdjustmentLine`, `InventoryCount`, `InventoryCountLine`, `InventorySetting`, and `InventoryAccountingEvent`.

Inventory models contain no JSON fields. Business relationships use foreign keys, and document numbers, stock keys, movement sources, accounting events, and line identities have unique constraints.

## Repositories

- `warehouse.repository.ts`
- `inventory.repository.ts`
- `purchase.repository.ts`
- `supplier.repository.ts`
- `transfer.repository.ts`
- `stock.repository.ts`
- `inventory-count.repository.ts`

## Services

- `WarehouseService`
- `InventoryService`
- `PurchaseService`
- `SupplierService`
- `TransferService`
- `StockMovementService`
- `InventoryCountService`
- inventory `NotificationService`
- `InventoryReportService`

## Safety behavior

- Stock reduction uses one conditional PostgreSQL update requiring `quantity >= requested quantity` unless negative stock is explicitly allowed.
- Goods receipts create the receipt, movement, stock update, lines, audit, notification, and pending event in one Prisma transaction.
- Transfers reduce the source and increase the destination in one transaction.
- Movement reversal applies the inverse stock change and creates a pending reversal event.
- Duplicate document numbers, stock keys, movement sources, and accounting events are rejected by database constraints.
- Inventory code never imports the journal service and never creates journal entries.
- Pending event types include `GOODS_RECEIPT`, `STOCK_ISSUE`, `STOCK_TRANSFER`, `INVENTORY_ADJUSTMENT`, and inventory reversals.

## Verification

- Prisma schema validation: passed
- Prisma client generation: passed
- TypeScript build: passed
- Complete suite: 19 tests passed
- Existing inventory endpoint path coverage: passed
- Forbidden SQLite/journal dependency scan in prepared inventory modules: passed
- Router-not-mounted isolation test: passed

The Phase 4 tests currently verify schema, architecture, endpoint coverage, isolation, and safety code paths. Live PostgreSQL integration scenarios were not run because this workspace still has no PostgreSQL test database.

## Remaining SQLite dependencies

- `src/inventory.ts` remains active only under the default SQLite runtime.
- The existing inventory handlers in `server.ts` remain for SQLite mode.
- Payroll and HR persistence remain SQLite-dependent.
- Phase 3 live accounting verification remains incomplete.

## Production blockers

1. Complete all Phase 3 PostgreSQL accounting integration and reconciliation tests.
2. Provision `TEST_DATABASE_URL`, apply migrations/seeds, and execute the requested warehouse, item, PO, receipt, transfer, adjustment, count, book/uniform issue, supplier, movement, duplicate, negative-stock, rollback, and restart scenarios.
3. Complete and verify inventory-count approval so approved variances create adjustment documents and movements.
4. Verify student linkage on book/uniform issues and contract output against the Angular client.
5. Test concurrent issues/transfers and idempotent retries under PostgreSQL isolation.
6. Review the pending-event consumer contract with the verified Phase 3 accounting module.
7. Only after these gates, explicitly mount `postgresInventoryRoutes`.

Production still defaults to `PERSISTENCE_DRIVER=sqlite`. No dual-write path exists. Inventory preparation is isolated from accounting posting and is not enabled for PostgreSQL runtime.
