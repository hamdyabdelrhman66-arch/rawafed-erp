import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { asyncController } from "./core.controller.js";
import { InventoryCountService } from "../services/inventory-count.service.js";
import { InventoryReportService } from "../services/inventory-report.service.js";
import { InventoryService } from "../services/inventory.service.js";
import { PurchaseService } from "../services/purchase.service.js";
import { StockMovementService } from "../services/stock-movement.service.js";
import { SupplierService } from "../services/supplier.service.js";
import { TransferService } from "../services/transfer.service.js";
import { WarehouseService } from "../services/warehouse.service.js";
const actor = (r: AuthRequest) => ({
  id: r.user?.id,
  displayName: r.user?.displayName,
  role: r.user?.role,
});
export class InventoryController {
  private warehouses;
  private inventory;
  private purchase;
  private movements;
  private transfers;
  private counts;
  private suppliers;
  private reports;
  constructor(prisma: PrismaClient) {
    this.warehouses = new WarehouseService(prisma);
    this.inventory = new InventoryService(prisma);
    this.purchase = new PurchaseService(prisma);
    this.movements = new StockMovementService(prisma);
    this.transfers = new TransferService(prisma);
    this.counts = new InventoryCountService(prisma);
    this.suppliers = new SupplierService(prisma);
    this.reports = new InventoryReportService(prisma);
  }
  warehouseList = asyncController(async (_r, s) =>
    s.json(await this.warehouses.list()),
  );
  warehouseCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.warehouses.create(r.body)),
  );
  warehouseUpdate = asyncController(async (r, s) =>
    s.json(await this.warehouses.update(r.params.id, r.body)),
  );
  categories = asyncController(async (_r, s) =>
    s.json(await this.inventory.categories()),
  );
  units = asyncController(async (_r, s) =>
    s.json(await this.inventory.units()),
  );
  items = asyncController(async (r, s) =>
    s.json(
      await this.inventory.items(
        Number(r.query.offset || 0),
        Number(r.query.limit || 100),
      ),
    ),
  );
  itemCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.inventory.create(r.body, actor(r))),
  );
  itemUpdate = asyncController(async (r, s) =>
    s.json(await this.inventory.update(r.params.id, r.body)),
  );
  movementList = asyncController(async (_r, s) =>
    s.json(await this.movements.list()),
  );
  movementCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.movements.create(r.body, actor(r))),
  );
  movementReverse = asyncController(async (r, s) =>
    s.status(201).json(await this.movements.reverse(r.params.id, actor(r))),
  );
  requestList = asyncController(async (_r, s) =>
    s.json(await this.purchase.requests()),
  );
  requestCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.purchase.createRequest(r.body, actor(r))),
  );
  requestStatus = asyncController(async (r, s) =>
    s.json(await this.purchase.requestStatus(r.params.id, r.body.status)),
  );
  orderList = asyncController(async (_r, s) =>
    s.json(await this.purchase.orders()),
  );
  orderCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.purchase.createOrder(r.body, actor(r))),
  );
  orderStatus = asyncController(async (r, s) =>
    s.json(await this.purchase.orderStatus(r.params.id, r.body.status)),
  );
  receiptList = asyncController(async (_r, s) =>
    s.json(await this.purchase.receipts()),
  );
  receiptCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.purchase.goodsReceipt(r.body, actor(r))),
  );
  studentIssue = asyncController(async (r, s) =>
    s
      .status(201)
      .json({
        movement: await this.movements.create(
          {
            ...r.body,
            studentId: r.body.studentId || r.body.customerId,
            movementType: "STOCK OUT",
            referenceType: "student_issue",
          },
          actor(r),
        ),
        invoice: null,
      }),
  );
  transferList = asyncController(async (_r, s) =>
    s.json(await this.transfers.list()),
  );
  transferCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.transfers.create(r.body, actor(r))),
  );
  countList = asyncController(async (_r, s) =>
    s.json(await this.counts.list()),
  );
  countCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.counts.create(r.body, actor(r))),
  );
  supplierList = asyncController(async (_r, s) =>
    s.json(await this.suppliers.list()),
  );
  reportsGet = asyncController(async (_r, s) =>
    s.json(await this.reports.reports()),
  );
  dashboard = asyncController(async (_r, s) =>
    s.json(await this.reports.dashboard()),
  );
}
