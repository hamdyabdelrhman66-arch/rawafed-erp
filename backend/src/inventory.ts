import { randomUUID } from 'node:crypto';
import { accountIdBySystemKey, createSystemJournal, receivableAccountForStudentContext, revenueAccountForItem } from './accounting.js';
import { dbAll, dbFirst, dbRun, dbTransaction, readDb, updateDb } from './db.js';
import { isVatExemptRegistration } from './finance.js';

interface InventoryActor {
  id?: string;
  name?: string;
}

export function listWarehouses(): any[] {
  return dbAll<any>(`
    SELECT w.*, COALESCE(SUM(s.quantity * s.average_cost), 0) AS stock_value
    FROM inventory_warehouses w
    LEFT JOIN inventory_stock s ON s.warehouse_id = w.id
    GROUP BY w.id
    ORDER BY w.code
  `).map(warehouseRow);
}

export function listInventoryCategories(): any[] {
  return dbAll<any>(`
    SELECT c.*, p.code AS parent_code, p.name_en AS parent_name_en
    FROM inventory_categories c
    LEFT JOIN inventory_categories p ON p.id = c.parent_id
    ORDER BY c.code
  `).map((row) => ({
    id: row.id,
    code: row.code,
    nameAr: row.name_ar || '',
    nameEn: row.name_en,
    parentId: row.parent_id || '',
    parentCode: row.parent_code || '',
    parentNameEn: row.parent_name_en || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function createWarehouse(input: any): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO inventory_warehouses (id, code, name, name_ar, name_en, location, responsible_employee, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.code || nextCode('inventory_warehouses', 'WH'), input.name || input.nameEn, input.nameAr || null, input.nameEn || input.name || null, input.location || null, input.responsibleEmployee || null, input.description || null, input.status || 'active', now, now]
  );
  return warehouseById(id);
}

export function updateWarehouse(id: string, input: any): any {
  const current = warehouseById(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  dbRun(
    'UPDATE inventory_warehouses SET code = ?, name = ?, name_ar = ?, name_en = ?, location = ?, responsible_employee = ?, description = ?, status = ?, updated_at = ? WHERE id = ?',
    [input.code ?? current.code, input.name ?? current.name, input.nameAr ?? current.nameAr ?? null, input.nameEn ?? current.nameEn ?? current.name ?? null, input.location ?? current.location ?? null, input.responsibleEmployee ?? current.responsibleEmployee ?? null, input.description ?? current.description ?? null, input.status ?? current.status, now, id]
  );
  return warehouseById(id);
}

export function listItems(): any[] {
  return dbAll<any>(`
    SELECT i.*, w.code AS warehouse_code, w.name AS warehouse_name,
           COALESCE(SUM(s.quantity), 0) AS current_quantity,
           COALESCE(SUM(s.quantity * s.average_cost), 0) AS current_value
    FROM inventory_items i
    LEFT JOIN inventory_warehouses w ON w.id = i.default_warehouse_id
    LEFT JOIN inventory_stock s ON s.item_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `).map(itemRow);
}

export function createItem(input: any): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const openingQuantity = roundMoney(input.openingQuantity || 0);
  const openingValue = roundMoney(input.openingValue || openingQuantity * Number(input.purchasePrice || 0));
  const averageCost = openingQuantity > 0 ? roundMoney(openingValue / openingQuantity) : roundMoney(input.purchasePrice || 0);
  dbTransaction(() => {
    dbRun(
      `INSERT INTO inventory_items (id, item_code, name_ar, name_en, category, subcategory, unit, barcode, qr_code, purchase_price, selling_price, vat_type, minimum_stock, maximum_stock, reorder_point, safety_stock, opening_quantity, opening_value, average_cost, default_warehouse_id, supplier_id, brand, description, taxable, vat_rate, status, images, attachments, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.itemCode || nextCode('inventory_items', 'ITM'),
        input.nameAr || null,
        input.nameEn,
        input.category,
        input.subcategory || null,
        input.unit || 'Each',
        input.barcode || null,
        input.qrCode || input.barcode || null,
        roundMoney(input.purchasePrice || 0),
        roundMoney(input.sellingPrice || 0),
        input.vatType || 'Taxable',
        roundMoney(input.minimumStock || 0),
        roundMoney(input.maximumStock || 0),
        roundMoney(input.reorderPoint || input.minimumStock || 0),
        roundMoney(input.safetyStock || 0),
        openingQuantity,
        openingValue,
        averageCost,
        input.defaultWarehouseId || null,
        input.supplierId || null,
        input.brand || null,
        input.description || null,
        input.taxable === false ? 0 : 1,
        Number(input.vatRate ?? 15),
        input.status || 'active',
        JSON.stringify(input.images || []),
        JSON.stringify(input.attachments || []),
        input.notes || null,
        now,
        now
      ]
    );
    if (openingQuantity > 0 && input.defaultWarehouseId) {
      upsertStock(id, input.defaultWarehouseId, openingQuantity, averageCost, now);
      insertMovement({
        movementType: 'Stock In',
        date: now.slice(0, 10),
        referenceNo: 'OPENING',
        itemId: id,
        quantity: openingQuantity,
        unitCost: averageCost,
        warehouseId: input.defaultWarehouseId,
        reason: 'Opening quantity'
      }, {});
    }
  });
  return itemById(id);
}

export function updateItem(id: string, input: any): any {
  const current = itemById(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  dbRun(
    `UPDATE inventory_items
     SET item_code = ?, name_ar = ?, name_en = ?, category = ?, subcategory = ?, unit = ?, barcode = ?, qr_code = ?, purchase_price = ?, selling_price = ?, vat_type = ?, minimum_stock = ?, maximum_stock = ?, reorder_point = ?, safety_stock = ?, default_warehouse_id = ?, supplier_id = ?, brand = ?, description = ?, taxable = ?, vat_rate = ?, status = ?, images = ?, attachments = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.itemCode ?? current.itemCode,
      input.nameAr ?? current.nameAr ?? null,
      input.nameEn ?? current.nameEn,
      input.category ?? current.category,
      input.subcategory ?? current.subcategory ?? null,
      input.unit ?? current.unit,
      input.barcode ?? current.barcode ?? null,
      input.qrCode ?? current.qrCode ?? null,
      roundMoney(input.purchasePrice ?? current.purchasePrice),
      roundMoney(input.sellingPrice ?? current.sellingPrice),
      input.vatType ?? current.vatType,
      roundMoney(input.minimumStock ?? current.minimumStock),
      roundMoney(input.maximumStock ?? current.maximumStock ?? 0),
      roundMoney(input.reorderPoint ?? current.reorderPoint ?? current.minimumStock ?? 0),
      roundMoney(input.safetyStock ?? current.safetyStock ?? 0),
      input.defaultWarehouseId ?? current.defaultWarehouseId ?? null,
      input.supplierId ?? current.supplierId ?? null,
      input.brand ?? current.brand ?? null,
      input.description ?? current.description ?? null,
      (input.taxable ?? current.taxable ?? true) ? 1 : 0,
      Number(input.vatRate ?? current.vatRate ?? 15),
      input.status ?? current.status,
      JSON.stringify(input.images ?? current.images ?? []),
      JSON.stringify(input.attachments ?? current.attachments ?? []),
      input.notes ?? current.notes ?? null,
      now,
      id
    ]
  );
  return itemById(id);
}

export function listStockMovements(): any[] {
  return dbAll<any>(`
    SELECT m.*, i.item_code, i.name_en AS item_name, w.code AS warehouse_code, w.name AS warehouse_name, tw.code AS to_warehouse_code, tw.name AS to_warehouse_name, je.entry_number
    FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.item_id
    JOIN inventory_warehouses w ON w.id = m.warehouse_id
    LEFT JOIN inventory_warehouses tw ON tw.id = m.to_warehouse_id
    LEFT JOIN accounting_journal_entries je ON je.id = m.journal_entry_id
    ORDER BY m.movement_date DESC, m.created_at DESC
  `).map(movementRow);
}

export function createStockMovement(input: any, actor: InventoryActor = {}): any {
  return dbTransaction(() => {
    const movement = insertMovement(input, actor);
    applyMovementToStock(input);
    const value = roundMoney(Math.abs(input.quantity) * input.unitCost);
    let journal: any;
    if (input.movementType === 'Adjustment' || input.movementType === 'Damage' || input.movementType === 'Write-off') {
      const isIncrease = Number(input.quantity || 0) > 0 && input.movementType === 'Adjustment';
      journal = createSystemJournal({
        referenceNumber: movement.movementNo,
        postingDate: input.date,
        description: `${input.movementType} ${movement.movementNo}`,
        sourceType: 'inventory_movement',
        sourceId: movement.id,
        lines: isIncrease
          ? [
              { accountId: accountIdBySystemKey('inventory'), debit: value, description: input.reason },
              { accountId: accountIdBySystemKey('stock-adjustment-gain'), credit: value, description: input.reason }
            ]
          : [
              { accountId: accountIdBySystemKey('stock-adjustment-loss'), debit: value, description: input.reason },
              { accountId: accountIdBySystemKey('inventory'), credit: value, description: input.reason }
            ]
      }, actor);
      dbRun('UPDATE inventory_movements SET journal_entry_id = ? WHERE id = ?', [journal.id, movement.id]);
    }
    return movementById(movement.id);
  });
}

export function listPurchaseRequests(): any[] {
  const requests = dbAll<any>('SELECT * FROM purchase_requests ORDER BY created_at DESC').map(requestRow);
  const lines = requestLines();
  return requests.map((request) => ({ ...request, items: lines.filter((line) => line.requestId === request.id) }));
}

export function createPurchaseRequest(input: any, actor: InventoryActor = {}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  dbTransaction(() => {
    dbRun(
      `INSERT INTO purchase_requests (id, request_no, department, requested_by, reason, priority, expected_date, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.requestNo || nextCode('purchase_requests', 'PR'), input.department, input.requestedBy, input.reason || null, input.priority || 'Normal', input.expectedDate || null, input.status || 'Draft', actor.id || null, now, now]
    );
    (input.items || []).forEach((line: any) => dbRun(
      'INSERT INTO purchase_request_lines (id, request_id, item_id, quantity, reason) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), id, line.itemId, roundMoney(line.quantity), line.reason || null]
    ));
  });
  return listPurchaseRequests().find((request) => request.id === id);
}

export function updatePurchaseRequestStatus(id: string, status: string): any {
  dbRun('UPDATE purchase_requests SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  return listPurchaseRequests().find((request) => request.id === id);
}

export function listPurchaseOrders(): any[] {
  const orders = dbAll<any>(`
    SELECT po.*, s.supplier_code, s.name_en AS supplier_name
    FROM purchase_orders po
    LEFT JOIN accounting_suppliers s ON s.id = po.supplier_id
    ORDER BY po.created_at DESC
  `).map(poRow);
  const lines = poLines();
  return orders.map((order) => ({ ...order, items: lines.filter((line) => line.poId === order.id) }));
}

export function createPurchaseOrder(input: any, actor: InventoryActor = {}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const totals = totalPurchaseLines(input.items || []);
  dbTransaction(() => {
    dbRun(
      `INSERT INTO purchase_orders (id, po_number, request_id, supplier_id, delivery_date, payment_terms, status, subtotal, vat_total, total, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.poNumber || nextCode('purchase_orders', 'PO'), input.requestId || null, input.supplierId || null, input.deliveryDate || null, input.paymentTerms || null, input.status || 'Draft', totals.subtotal, totals.vatTotal, totals.total, actor.id || null, now, now]
    );
    (input.items || []).forEach((line: any) => {
      const qty = roundMoney(line.quantity);
      const unitPrice = roundMoney(line.unitPrice);
      const vatRate = Number(line.vatRate ?? 15);
      const beforeVat = roundMoney(qty * unitPrice);
      const vatAmount = roundMoney(beforeVat * vatRate / 100);
      dbRun(
        `INSERT INTO purchase_order_lines (id, po_id, item_id, quantity, unit_price, vat_rate, vat_amount, total, received_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [randomUUID(), id, line.itemId, qty, unitPrice, vatRate, vatAmount, roundMoney(beforeVat + vatAmount)]
      );
    });
    if (input.requestId) updatePurchaseRequestStatus(input.requestId, 'Converted to Purchase Order');
  });
  return listPurchaseOrders().find((order) => order.id === id);
}

export function updatePurchaseOrderStatus(id: string, status: string): any {
  dbRun('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  return listPurchaseOrders().find((order) => order.id === id);
}

export function listGoodsReceipts(): any[] {
  const receipts = dbAll<any>(`
    SELECT g.*, po.po_number, s.supplier_code, s.name_en AS supplier_name, w.code AS warehouse_code, w.name AS warehouse_name, je.entry_number
    FROM goods_receipts g
    LEFT JOIN purchase_orders po ON po.id = g.po_id
    LEFT JOIN accounting_suppliers s ON s.id = g.supplier_id
    JOIN inventory_warehouses w ON w.id = g.warehouse_id
    LEFT JOIN accounting_journal_entries je ON je.id = g.journal_entry_id
    ORDER BY g.received_date DESC, g.created_at DESC
  `).map(grnRow);
  const lines = grnLines();
  return receipts.map((receipt) => ({ ...receipt, items: lines.filter((line) => line.grnId === receipt.id) }));
}

export function createGoodsReceipt(input: any, actor: InventoryActor = {}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const po = input.poId ? dbFirst<any>('SELECT * FROM purchase_orders WHERE id = ?', [input.poId]) : undefined;
  const lines = input.items?.length ? input.items : poLines().filter((line) => line.poId === input.poId).map((line) => ({
    poLineId: line.id,
    itemId: line.itemId,
    quantity: roundMoney(line.quantity - line.receivedQuantity),
    unitPrice: line.unitPrice,
    vatRate: line.vatRate
  }));
  const totals = totalPurchaseLines(lines);
  return dbTransaction(() => {
    dbRun(
      `INSERT INTO goods_receipts (id, grn_number, po_id, supplier_id, warehouse_id, received_date, supplier_invoice_no, status, subtotal, vat_total, total, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Received', ?, ?, ?, ?, ?)`,
      [id, input.grnNumber || nextCode('goods_receipts', 'GRN'), input.poId || null, input.supplierId || po?.supplier_id || null, input.warehouseId, input.receivedDate, input.supplierInvoiceNo || null, totals.subtotal, totals.vatTotal, totals.total, actor.id || null, now]
    );
    const inventoryLines: any[] = [];
    lines.forEach((line: any) => {
      const qty = roundMoney(line.quantity);
      if (qty <= 0) return;
      const unitPrice = roundMoney(line.unitPrice);
      const vatRate = Number(line.vatRate ?? 15);
      const beforeVat = roundMoney(qty * unitPrice);
      const vatAmount = roundMoney(beforeVat * vatRate / 100);
      const movement = insertMovement({
        movementType: 'Stock In',
        date: input.receivedDate,
        referenceNo: input.grnNumber || id,
        itemId: line.itemId,
        quantity: qty,
        unitCost: unitPrice,
        warehouseId: input.warehouseId,
        reason: 'Goods receiving'
      }, actor);
      applyMovementToStock({ movementType: 'Stock In', itemId: line.itemId, warehouseId: input.warehouseId, quantity: qty, unitCost: unitPrice });
      dbRun(
        `INSERT INTO goods_receipt_lines (id, grn_id, po_line_id, item_id, quantity, unit_price, vat_rate, vat_amount, total, movement_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, line.poLineId || null, line.itemId, qty, unitPrice, vatRate, vatAmount, roundMoney(beforeVat + vatAmount), movement.id]
      );
      if (line.poLineId) dbRun('UPDATE purchase_order_lines SET received_quantity = received_quantity + ? WHERE id = ?', [qty, line.poLineId]);
      inventoryLines.push({ beforeVat, vatAmount });
    });
    const supplierId = input.supplierId || po?.supplier_id;
    if (supplierId) {
      const payableAccountId = supplierPayableAccountId(supplierId);
      const journal = createSystemJournal({
        referenceNumber: input.supplierInvoiceNo || input.grnNumber || id,
        postingDate: input.receivedDate,
        description: `Supplier invoice from GRN ${input.grnNumber || id}`,
        sourceType: 'goods_receipt',
        sourceId: id,
        lines: [
          { accountId: accountIdBySystemKey('inventory'), debit: totals.subtotal, description: 'Inventory purchase' },
          ...(totals.vatTotal > 0 ? [{ accountId: accountIdBySystemKey('input-vat'), debit: totals.vatTotal, description: 'Input VAT' }] : []),
          { accountId: payableAccountId, credit: totals.total, description: 'Accounts payable' }
        ]
      }, actor);
      dbRun('UPDATE goods_receipts SET journal_entry_id = ? WHERE id = ?', [journal.id, id]);
    }
    refreshPoReceivedStatus(input.poId);
    return listGoodsReceipts().find((receipt) => receipt.id === id);
  });
}

export function issueItemToStudent(input: any, actor: InventoryActor = {}): any {
  const db = readDb();
  const customer = dbFirst<any>('SELECT * FROM accounting_customers WHERE id = ?', [input.customerId]);
  if (!customer) throw new Error('Customer not found.');
  const item = itemById(input.itemId);
  if (!item) throw new Error('Item not found.');
  const qty = roundMoney(input.quantity);
  const unitCost = roundMoney(item.averageCost || item.purchasePrice || 0);
  const cost = roundMoney(qty * unitCost);
  const movement = createStockMovement({
    movementType: 'Stock Out',
    date: input.date,
    referenceNo: input.referenceNo || `ISS-${Date.now()}`,
    itemId: item.id,
    quantity: qty,
    unitCost,
    warehouseId: input.warehouseId,
    reason: input.reason || 'Issue to student'
  }, actor);
  if (!input.billable) return { movement, invoice: null };

  const registration = customer.registration_id
    ? db.registrations.find((record: any) => record.id === customer.registration_id)
    : db.registrations.find((record: any) => record.registrationNumber === customer.registration_number);
  const vatExempt = isVatExemptRegistration(registration);
  const beforeVat = roundMoney(qty * Number(input.sellingPrice ?? item.sellingPrice ?? 0));
  const vat = vatExempt || item.vatType === 'Exempt' ? 0 : roundMoney(beforeVat * 0.15);
  const total = roundMoney(beforeVat + vat);
  const invoice = {
    id: randomUUID(),
    accountId: undefined,
    registrationId: customer.registration_id || undefined,
    registrationNumber: customer.registration_number || undefined,
    invoiceNumber: `INV-${Date.now()}`,
    studentName: customer.name_en,
    feeItem: item.category === 'Uniform' ? 'Uniform' : item.category === 'Books' ? 'Books' : item.name_en,
    amountBeforeVat: beforeVat,
    vat,
    total,
    paid: 0,
    remaining: total,
    paymentMethod: 'Credit',
    status: 'Pending' as const,
    issuedAt: input.date,
    createdAt: new Date().toISOString()
  };
  updateDb((next) => next.financeInvoices.unshift(invoice));
  createSystemJournal({
    referenceNumber: invoice.invoiceNumber,
    postingDate: input.date,
    description: `Inventory sale to student ${invoice.invoiceNumber}`,
    sourceType: 'finance_invoice',
    sourceId: invoice.id,
    lines: [
      { accountId: receivableAccountForStudentContext(invoice), debit: total, description: customer.name_en },
      { accountId: revenueAccountForItem(invoice.feeItem), credit: beforeVat, description: invoice.feeItem },
      ...(vat > 0 ? [{ accountId: accountIdBySystemKey('vat-payable'), credit: vat, description: 'Output VAT' }] : [])
    ]
  }, actor);
  if (cost > 0) {
    createSystemJournal({
      referenceNumber: `COGS-${invoice.invoiceNumber}`,
      postingDate: input.date,
      description: `COGS ${invoice.invoiceNumber}`,
      sourceType: 'inventory_cogs',
      sourceId: movement.id,
      lines: [
        { accountId: accountIdBySystemKey('cost-of-goods-sold'), debit: cost, description: item.nameEn },
        { accountId: accountIdBySystemKey('inventory'), credit: cost, description: item.nameEn }
      ]
    }, actor);
  }
  return { movement, invoice };
}

export function inventoryReports(): any {
  const stockRows = dbAll<any>(`
    SELECT i.id AS item_id, i.item_code, i.name_en, i.name_ar, i.category, i.unit, i.minimum_stock,
           w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
           COALESCE(s.quantity, 0) AS quantity, COALESCE(s.average_cost, 0) AS average_cost,
           COALESCE(s.quantity * s.average_cost, 0) AS value
    FROM inventory_items i
    CROSS JOIN inventory_warehouses w
    LEFT JOIN inventory_stock s ON s.item_id = i.id AND s.warehouse_id = w.id
    ORDER BY i.item_code, w.code
  `);
  const lowStock = listItems().filter((item) => Number(item.currentQuantity || 0) <= Number(item.minimumStock || 0));
  const valuation = roundMoney(stockRows.reduce((sum, row) => sum + Number(row.value || 0), 0));
  const damaged = listStockMovements().filter((row) => ['Damage', 'Write-off'].includes(row.movementType));
  return {
    stockBalance: stockRows.map(stockBalanceRow),
    warehouseBalance: listWarehouses(),
    lowStock,
    stockValuation: { total: valuation, rows: stockRows.map(stockBalanceRow) },
    damagedItems: damaged,
    movements: listStockMovements(),
    purchasesBySupplier: listPurchaseOrders(),
    purchasesByItem: poLines(),
    issuedToStudents: listStockMovements().filter((row) => String(row.reason || '').toLowerCase().includes('student')),
    adjustments: listStockMovements().filter((row) => row.movementType === 'Adjustment')
  };
}

export function inventoryDashboard(): any {
  const items = listItems();
  const warehouses = listWarehouses();
  const movements = listStockMovements();
  const purchaseRequests = listPurchaseRequests();
  const purchaseOrders = listPurchaseOrders();
  const goodsReceipts = listGoodsReceipts();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const totalInventoryValue = roundMoney(items.reduce((sum, item) => sum + Number(item.currentValue || 0), 0));
  const lowStockItems = items.filter((item) => Number(item.currentQuantity || 0) <= Number(item.minimumStock || 0));
  const outOfStockItems = items.filter((item) => Number(item.currentQuantity || 0) <= 0);
  const pendingPurchaseRequests = purchaseRequests.filter((request) => ['Draft', 'Submitted', 'Approved'].includes(request.status));
  const pendingPurchaseOrders = purchaseOrders.filter((order) => !['Received', 'Cancelled'].includes(order.status));
  const pendingGoodsReceiving = purchaseOrders.filter((order) => ['Approved', 'Sent', 'Partially Received'].includes(order.status));
  const todaysStockMovements = movements.filter((movement) => movement.date === today);
  const monthPurchases = goodsReceipts
    .filter((receipt) => String(receipt.receivedDate || '').slice(0, 7) === month)
    .reduce((sum, receipt) => sum + Number(receipt.total || 0), 0);
  const damagedItems = movements.filter((movement) => ['Damage', 'Write-off', 'Lost'].includes(movement.movementType));
  const returnedItems = movements.filter((movement) => movement.movementType === 'Return');
  const inventoryAdjustments = movements.filter((movement) => movement.movementType === 'Adjustment');

  const stockByCategoryMap = new Map<string, number>();
  items.forEach((item) => stockByCategoryMap.set(item.category, roundMoney((stockByCategoryMap.get(item.category) || 0) + Number(item.currentValue || 0))));

  const purchasesPerMonthMap = new Map<string, number>();
  goodsReceipts.forEach((receipt) => {
    const key = String(receipt.receivedDate || receipt.createdAt || '').slice(0, 7) || 'Unknown';
    purchasesPerMonthMap.set(key, roundMoney((purchasesPerMonthMap.get(key) || 0) + Number(receipt.total || 0)));
  });

  const issueMap = new Map<string, { itemCode: string; itemName: string; quantity: number }>();
  movements.filter((movement) => movement.movementType === 'Stock Out').forEach((movement) => {
    const current = issueMap.get(movement.itemId) || { itemCode: movement.itemCode, itemName: movement.itemName, quantity: 0 };
    current.quantity = roundMoney(current.quantity + Math.abs(Number(movement.quantity || 0)));
    issueMap.set(movement.itemId, current);
  });

  const purchasedMap = new Map<string, { itemCode: string; itemName: string; quantity: number }>();
  goodsReceipts.flatMap((receipt) => receipt.items || []).forEach((line) => {
    const current = purchasedMap.get(line.itemId) || { itemCode: line.itemCode, itemName: line.itemName, quantity: 0 };
    current.quantity = roundMoney(current.quantity + Number(line.quantity || 0));
    purchasedMap.set(line.itemId, current);
  });

  return {
    cards: {
      totalInventoryValue,
      totalItems: items.length,
      totalWarehouses: warehouses.length,
      lowStockItems: lowStockItems.length,
      outOfStockItems: outOfStockItems.length,
      pendingPurchaseRequests: pendingPurchaseRequests.length,
      pendingPurchaseOrders: pendingPurchaseOrders.length,
      pendingGoodsReceiving: pendingGoodsReceiving.length,
      todaysStockMovements: todaysStockMovements.length,
      thisMonthPurchases: roundMoney(monthPurchases),
      damagedItems: damagedItems.length,
      returnedItems: returnedItems.length,
      inventoryAdjustments: inventoryAdjustments.length
    },
    charts: {
      stockByCategory: [...stockByCategoryMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      purchasesPerMonth: [...purchasesPerMonthMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
      mostIssuedItems: [...issueMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
      mostPurchasedItems: [...purchasedMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8)
    },
    recent: {
      stockMovements: movements.slice(0, 8),
      purchaseRequests: purchaseRequests.slice(0, 8),
      goodsReceiving: goodsReceipts.slice(0, 8)
    },
    alerts: {
      lowStockItems: lowStockItems.slice(0, 8),
      outOfStockItems: outOfStockItems.slice(0, 8)
    }
  };
}

function insertMovement(input: any, actor: InventoryActor): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  dbRun(
    `INSERT INTO inventory_movements (id, movement_no, movement_type, movement_date, reference_no, item_id, quantity, unit_cost, warehouse_id, to_warehouse_id, reason, attachment_upload_id, attachment_file_name, attachment_url, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.movementNo || nextCode('inventory_movements', 'MOV'),
      input.movementType,
      input.date,
      input.referenceNo || null,
      input.itemId,
      roundMoney(input.quantity),
      roundMoney(input.unitCost),
      input.warehouseId,
      input.toWarehouseId || null,
      input.reason || null,
      input.attachmentUploadId || null,
      input.attachmentFileName || null,
      input.attachmentUrl || null,
      actor.id || null,
      now
    ]
  );
  return movementById(id);
}

function applyMovementToStock(input: any): void {
  const qty = roundMoney(input.quantity);
  const cost = roundMoney(input.unitCost);
  if (input.movementType === 'Transfer') {
    upsertStock(input.itemId, input.warehouseId, -qty, cost, new Date().toISOString());
    upsertStock(input.itemId, input.toWarehouseId, qty, cost, new Date().toISOString());
    return;
  }
  const sign = ['Stock In', 'Return'].includes(input.movementType) ? 1 : input.movementType === 'Adjustment' ? (qty >= 0 ? 1 : -1) : -1;
  upsertStock(input.itemId, input.warehouseId, sign * Math.abs(qty), cost, new Date().toISOString());
}

function upsertStock(itemId: string, warehouseId: string, quantityDelta: number, unitCost: number, now: string): void {
  const current = dbFirst<any>('SELECT * FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?', [itemId, warehouseId]);
  const currentQty = Number(current?.quantity || 0);
  const currentCost = Number(current?.average_cost || 0);
  const newQty = roundMoney(currentQty + quantityDelta);
  const newCost = quantityDelta > 0 && newQty > 0
    ? roundMoney(((currentQty * currentCost) + (quantityDelta * unitCost)) / newQty)
    : currentCost || unitCost;
  dbRun(
    `INSERT INTO inventory_stock (item_id, warehouse_id, quantity, average_cost, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity, average_cost = excluded.average_cost, updated_at = excluded.updated_at`,
    [itemId, warehouseId, newQty, newCost, now]
  );
  const weighted = dbFirst<any>('SELECT SUM(quantity * average_cost) AS value, SUM(quantity) AS qty FROM inventory_stock WHERE item_id = ?', [itemId]);
  const avg = Number(weighted?.qty || 0) > 0 ? roundMoney(Number(weighted.value || 0) / Number(weighted.qty || 0)) : newCost;
  dbRun('UPDATE inventory_items SET average_cost = ?, updated_at = ? WHERE id = ?', [avg, now, itemId]);
}

function refreshPoReceivedStatus(poId?: string): void {
  if (!poId) return;
  const lines = dbAll<any>('SELECT quantity, received_quantity FROM purchase_order_lines WHERE po_id = ?', [poId]);
  if (!lines.length) return;
  const allReceived = lines.every((line) => Number(line.received_quantity || 0) >= Number(line.quantity || 0));
  const anyReceived = lines.some((line) => Number(line.received_quantity || 0) > 0);
  dbRun('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?', [allReceived ? 'Received' : anyReceived ? 'Partially Received' : 'Approved', new Date().toISOString(), poId]);
}

function totalPurchaseLines(lines: any[]): any {
  return lines.reduce((sum, line) => {
    const beforeVat = roundMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0));
    const vatAmount = roundMoney(beforeVat * Number(line.vatRate ?? 15) / 100);
    return {
      subtotal: roundMoney(sum.subtotal + beforeVat),
      vatTotal: roundMoney(sum.vatTotal + vatAmount),
      total: roundMoney(sum.total + beforeVat + vatAmount)
    };
  }, { subtotal: 0, vatTotal: 0, total: 0 });
}

function supplierPayableAccountId(supplierId: string): string {
  const supplier = dbFirst<any>('SELECT payable_account_id FROM accounting_suppliers WHERE id = ?', [supplierId]);
  return supplier?.payable_account_id || accountIdBySystemKey('suppliers');
}

function warehouseById(id: string): any {
  return listWarehouses().find((warehouse) => warehouse.id === id);
}

function itemById(id: string): any {
  return listItems().find((item) => item.id === id);
}

function movementById(id: string): any {
  return listStockMovements().find((movement) => movement.id === id);
}

function requestLines(): any[] {
  return dbAll<any>(`
    SELECT l.*, i.item_code, i.name_en AS item_name
    FROM purchase_request_lines l
    JOIN inventory_items i ON i.id = l.item_id
  `).map((row) => ({ id: row.id, requestId: row.request_id, itemId: row.item_id, itemCode: row.item_code, itemName: row.item_name, quantity: Number(row.quantity || 0), reason: row.reason || '' }));
}

function poLines(): any[] {
  return dbAll<any>(`
    SELECT l.*, i.item_code, i.name_en AS item_name
    FROM purchase_order_lines l
    JOIN inventory_items i ON i.id = l.item_id
  `).map((row) => ({
    id: row.id,
    poId: row.po_id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    vatRate: Number(row.vat_rate || 0),
    vatAmount: Number(row.vat_amount || 0),
    total: Number(row.total || 0),
    receivedQuantity: Number(row.received_quantity || 0)
  }));
}

function grnLines(): any[] {
  return dbAll<any>(`
    SELECT l.*, i.item_code, i.name_en AS item_name
    FROM goods_receipt_lines l
    JOIN inventory_items i ON i.id = l.item_id
  `).map((row) => ({
    id: row.id,
    grnId: row.grn_id,
    poLineId: row.po_line_id || '',
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    vatRate: Number(row.vat_rate || 0),
    vatAmount: Number(row.vat_amount || 0),
    total: Number(row.total || 0),
    movementId: row.movement_id || ''
  }));
}

function warehouseRow(row: any): any {
  return { id: row.id, code: row.code, name: row.name, nameAr: row.name_ar || '', nameEn: row.name_en || row.name, location: row.location || '', responsibleEmployee: row.responsible_employee || '', description: row.description || '', status: row.status, currentStockValue: Number(row.stock_value || 0), createdAt: row.created_at, updatedAt: row.updated_at };
}

function itemRow(row: any): any {
  return {
    id: row.id,
    itemCode: row.item_code,
    nameAr: row.name_ar || '',
    nameEn: row.name_en,
    category: row.category,
    subcategory: row.subcategory || '',
    unit: row.unit,
    barcode: row.barcode || '',
    qrCode: row.qr_code || '',
    purchasePrice: Number(row.purchase_price || 0),
    sellingPrice: Number(row.selling_price || 0),
    vatType: row.vat_type,
    minimumStock: Number(row.minimum_stock || 0),
    maximumStock: Number(row.maximum_stock || 0),
    reorderPoint: Number(row.reorder_point || row.minimum_stock || 0),
    safetyStock: Number(row.safety_stock || 0),
    openingQuantity: Number(row.opening_quantity || 0),
    openingValue: Number(row.opening_value || 0),
    averageCost: Number(row.average_cost || 0),
    defaultWarehouseId: row.default_warehouse_id || '',
    defaultWarehouseCode: row.warehouse_code || '',
    defaultWarehouseName: row.warehouse_name || '',
    supplierId: row.supplier_id || '',
    brand: row.brand || '',
    description: row.description || '',
    taxable: row.taxable === undefined ? true : Boolean(row.taxable),
    vatRate: Number(row.vat_rate ?? 15),
    status: row.status,
    images: parseJson(row.images, []),
    attachments: parseJson(row.attachments, []),
    notes: row.notes || '',
    currentQuantity: Number(row.current_quantity || 0),
    currentValue: Number(row.current_value || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function movementRow(row: any): any {
  return { id: row.id, movementNo: row.movement_no, movementType: row.movement_type, date: row.movement_date, referenceNo: row.reference_no || '', itemId: row.item_id, itemCode: row.item_code, itemName: row.item_name, quantity: Number(row.quantity || 0), unitCost: Number(row.unit_cost || 0), warehouseId: row.warehouse_id, warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, toWarehouseId: row.to_warehouse_id || '', toWarehouseCode: row.to_warehouse_code || '', toWarehouseName: row.to_warehouse_name || '', reason: row.reason || '', attachmentUrl: row.attachment_url || '', journalEntryId: row.journal_entry_id || '', journalEntryNo: row.entry_number || '', createdAt: row.created_at };
}

function requestRow(row: any): any {
  return { id: row.id, requestNo: row.request_no, department: row.department, requestedBy: row.requested_by, reason: row.reason || '', priority: row.priority, expectedDate: row.expected_date || '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function poRow(row: any): any {
  return { id: row.id, poNumber: row.po_number, requestId: row.request_id || '', supplierId: row.supplier_id || '', supplierCode: row.supplier_code || '', supplierName: row.supplier_name || '', deliveryDate: row.delivery_date || '', paymentTerms: row.payment_terms || '', status: row.status, subtotal: Number(row.subtotal || 0), vatTotal: Number(row.vat_total || 0), total: Number(row.total || 0), createdAt: row.created_at, updatedAt: row.updated_at };
}

function grnRow(row: any): any {
  return { id: row.id, grnNumber: row.grn_number, poId: row.po_id || '', poNumber: row.po_number || '', supplierId: row.supplier_id || '', supplierCode: row.supplier_code || '', supplierName: row.supplier_name || '', warehouseId: row.warehouse_id, warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, receivedDate: row.received_date, supplierInvoiceNo: row.supplier_invoice_no || '', status: row.status, subtotal: Number(row.subtotal || 0), vatTotal: Number(row.vat_total || 0), total: Number(row.total || 0), journalEntryId: row.journal_entry_id || '', journalEntryNo: row.entry_number || '', createdAt: row.created_at };
}

function stockBalanceRow(row: any): any {
  return { itemId: row.item_id, itemCode: row.item_code, nameEn: row.name_en, nameAr: row.name_ar || '', category: row.category, unit: row.unit, minimumStock: Number(row.minimum_stock || 0), warehouseId: row.warehouse_id, warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, quantity: Number(row.quantity || 0), averageCost: Number(row.average_cost || 0), value: Number(row.value || 0) };
}

function nextCode(table: string, prefix: string): string {
  const row = dbFirst<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  return `${prefix}-${String(Number(row?.total || 0) + 1).padStart(6, '0')}`;
}

function parseJson(value: any, fallback: any): any {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}
