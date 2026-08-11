import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { InventoryService } from '../../../core/inventory/inventory.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';

type InventoryTab = 'dashboard' | 'items' | 'warehouses' | 'movements' | 'pr' | 'po' | 'grn' | 'students' | 'reports';

@Component({
  selector: 'app-inventory-erp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-erp.html',
  styleUrls: ['./inventory-erp.css', '../../../shared/finance/finance-ui.scss']
})
export class InventoryErp implements OnInit {
  tab: InventoryTab = 'dashboard';
  dashboard: any;
  items: any[] = [];
  warehouses: any[] = [];
  movements: any[] = [];
  purchaseRequests: any[] = [];
  purchaseOrders: any[] = [];
  goodsReceipts: any[] = [];
  suppliers: any[] = [];
  customers: any[] = [];
  reports: any;
  searchText = '';
  categoryMaster: any[] = [];

  categories = ['Books', 'Uniform', 'Stationery', 'Devices', 'Furniture', 'Equipment', 'Bus spare parts', 'Cleaning supplies', 'Maintenance materials', 'Other'];
  movementTypes = ['Stock In', 'Stock Out', 'Transfer', 'Adjustment', 'Return', 'Damage', 'Write-off'];
  prStatuses = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Converted to Purchase Order'];
  poStatuses = ['Draft', 'Approved', 'Sent', 'Partially Received', 'Received', 'Cancelled'];

  itemForm = this.emptyItem();
  warehouseForm = this.emptyWarehouse();
  movementForm = this.emptyMovement();
  prForm = this.emptyPurchaseRequest();
  poForm = this.emptyPurchaseOrder();
  grnForm = this.emptyGoodsReceipt();
  issueForm = this.emptyIssue();

  constructor(
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly feedback: FeedbackService,
    private readonly reportExport: ReportExportService
  ) {}

  async ngOnInit(): Promise<void> {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as InventoryTab | null;
      if (tab && ['dashboard', 'items', 'warehouses', 'movements', 'pr', 'po', 'grn', 'students', 'reports'].includes(tab)) {
        this.tab = tab;
      } else {
        this.tab = 'dashboard';
      }
    });
    await this.load();
  }

  async load(): Promise<void> {
    [this.dashboard, this.categoryMaster, this.items, this.warehouses, this.movements, this.purchaseRequests, this.purchaseOrders, this.goodsReceipts, this.suppliers, this.customers, this.reports] = await Promise.all([
      this.inventory.getDashboard(),
      this.inventory.getCategories(),
      this.inventory.getItems(),
      this.inventory.getWarehouses(),
      this.inventory.getMovements(),
      this.inventory.getPurchaseRequests(),
      this.inventory.getPurchaseOrders(),
      this.inventory.getGoodsReceipts(),
      this.accounting.getSuppliers(),
      this.accounting.getCustomers(),
      this.inventory.getReports()
    ]);
    this.ensureDefaultWarehouse();
  }

  get filteredItems(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.items.filter((item) => !query || [item.itemCode, item.nameAr, item.nameEn, item.category, item.barcode].join(' ').toLowerCase().includes(query));
  }

  get totals(): any {
    return {
      stockValue: this.items.reduce((sum, item) => sum + Number(item.currentValue || 0), 0),
      lowStock: this.items.filter((item) => Number(item.currentQuantity || 0) <= Number(item.minimumStock || 0)).length,
      openPr: this.purchaseRequests.filter((request) => !['Rejected', 'Converted to Purchase Order'].includes(request.status)).length,
      openPo: this.purchaseOrders.filter((order) => !['Received', 'Cancelled'].includes(order.status)).length
    };
  }

  get dashboardCards(): Array<{ label: string; value: number; kind: 'money' | 'count'; action?: string }> {
    const cards = this.dashboard?.cards || {};
    return [
      { label: 'Total Inventory Value', value: cards.totalInventoryValue, kind: 'money', action: 'reports' },
      { label: 'Total Items', value: cards.totalItems, kind: 'count', action: 'items' },
      { label: 'Total Warehouses', value: cards.totalWarehouses, kind: 'count', action: 'warehouses' },
      { label: 'Low Stock Items', value: cards.lowStockItems, kind: 'count', action: 'reports' },
      { label: 'Out Of Stock Items', value: cards.outOfStockItems, kind: 'count', action: 'reports' },
      { label: 'Pending Purchase Requests', value: cards.pendingPurchaseRequests, kind: 'count', action: 'pr' },
      { label: 'Pending Purchase Orders', value: cards.pendingPurchaseOrders, kind: 'count', action: 'po' },
      { label: 'Pending Goods Receiving', value: cards.pendingGoodsReceiving, kind: 'count', action: 'grn' },
      { label: "Today's Stock Movements", value: cards.todaysStockMovements, kind: 'count', action: 'movements' },
      { label: 'This Month Purchases', value: cards.thisMonthPurchases, kind: 'money', action: 'grn' },
      { label: 'Damaged Items', value: cards.damagedItems, kind: 'count', action: 'reports' },
      { label: 'Returned Items', value: cards.returnedItems, kind: 'count', action: 'movements' },
      { label: 'Inventory Adjustments', value: cards.inventoryAdjustments, kind: 'count', action: 'movements' }
    ];
  }

  chartWidth(rows: any[] = [], key = 'value', row: any): number {
    const max = Math.max(1, ...rows.map((item) => Math.abs(Number(item[key] || 0))));
    return Math.max(4, Math.round((Math.abs(Number(row[key] || 0)) / max) * 100));
  }

  openTab(tab: string): void {
    const nextTab = tab as InventoryTab;
    if (!['dashboard', 'items', 'warehouses', 'movements', 'pr', 'po', 'grn', 'students', 'reports'].includes(nextTab)) return;
    this.tab = nextTab;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: nextTab === 'dashboard' ? {} : { tab: nextTab },
      queryParamsHandling: 'replace'
    });
  }

  async saveItem(): Promise<void> {
    await this.runInventoryAction('Item created successfully.', async () => {
      await this.inventory.createItem(this.itemForm);
      this.itemForm = this.emptyItem();
    });
  }

  async saveWarehouse(): Promise<void> {
    await this.runInventoryAction('Warehouse created successfully.', async () => {
      await this.inventory.createWarehouse(this.warehouseForm);
      this.warehouseForm = this.emptyWarehouse();
    });
  }

  async saveMovement(): Promise<void> {
    await this.runInventoryAction('Stock movement saved successfully.', async () => {
      await this.inventory.createMovement(this.movementForm);
      this.movementForm = this.emptyMovement();
    });
  }

  async savePurchaseRequest(): Promise<void> {
    await this.runInventoryAction('Purchase request created successfully.', async () => {
      await this.inventory.createPurchaseRequest(this.prForm);
      this.prForm = this.emptyPurchaseRequest();
    });
  }

  async setPurchaseRequestStatus(request: any, status: string): Promise<void> {
    await this.runInventoryAction(`Purchase request ${status.toLowerCase()} successfully.`, () => this.inventory.updatePurchaseRequestStatus(request.id, status));
  }

  async savePurchaseOrder(): Promise<void> {
    await this.runInventoryAction('Purchase order created successfully.', async () => {
      await this.inventory.createPurchaseOrder(this.poForm);
      this.poForm = this.emptyPurchaseOrder();
    });
  }

  async setPurchaseOrderStatus(order: any, status: string): Promise<void> {
    await this.runInventoryAction(`Purchase order ${status.toLowerCase()} successfully.`, () => this.inventory.updatePurchaseOrderStatus(order.id, status));
  }

  async saveGoodsReceipt(): Promise<void> {
    await this.runInventoryAction('Goods received, stock updated, and journal created successfully.', async () => {
      await this.inventory.createGoodsReceipt(this.grnForm);
      this.grnForm = this.emptyGoodsReceipt();
    });
  }

  async issueToStudent(): Promise<void> {
    await this.runInventoryAction('Items issued to student successfully.', async () => {
      await this.inventory.issueToStudent(this.issueForm);
      this.issueForm = this.emptyIssue();
    });
  }

  addPrLine(): void {
    this.prForm.items.push({ itemId: '', quantity: 1, reason: '' });
  }

  addPoLine(): void {
    this.poForm.items.push({ itemId: '', quantity: 1, unitPrice: 0, vatRate: 15 });
  }

  addGrnLine(): void {
    this.grnForm.items.push({ itemId: '', quantity: 1, unitPrice: 0, vatRate: 15 });
  }

  usePoForGrn(order: any): void {
    this.grnForm.poId = order.id;
    this.grnForm.supplierId = order.supplierId;
    this.grnForm.items = order.items.map((line: any) => ({
      poLineId: line.id,
      itemId: line.itemId,
      quantity: Math.max(0, Number(line.quantity || 0) - Number(line.receivedQuantity || 0)),
      unitPrice: line.unitPrice,
      vatRate: line.vatRate
    }));
    this.openTab('grn');
  }

  itemName(id: string): string {
    const item = this.items.find((row) => row.id === id);
    return item ? `${item.itemCode} - ${item.nameEn}` : '-';
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} SAR`;
  }

  async print(): Promise<void> {
    await this.reportExport.printPdf(this.inventoryReport());
  }

  private inventoryReport(): ReportTable {
    const reports: Record<string, { title: string; columns: string[]; rows: Array<Array<string | number>> }> = {
      items: {
        title: 'سجل الأصناف',
        columns: ['الكود', 'الاسم العربي', 'الاسم الإنجليزي', 'الفئة', 'الكمية', 'القيمة الحالية', 'الحالة'],
        rows: this.filteredItems.map((item) => [item.itemCode, item.nameAr || 'غير مسجل', item.nameEn || 'غير مسجل', item.category || 'غير مسجل', Number(item.currentQuantity || item.quantity || 0), Number(item.currentValue || 0), item.status || '—']),
      },
      warehouses: {
        title: 'سجل المستودعات',
        columns: ['الكود', 'الاسم', 'الموقع', 'المسؤول', 'الحالة'],
        rows: this.warehouses.map((row) => [row.code, row.nameAr || row.nameEn || row.name, row.location || 'غير مسجل', row.responsibleEmployee || 'غير مسجل', row.status || '—']),
      },
      movements: {
        title: 'حركة المخزون',
        columns: ['التاريخ', 'النوع', 'الصنف', 'المستودع', 'الكمية', 'المرجع'],
        rows: this.movements.map((row) => [row.date || row.createdAt, row.movementType || row.type, this.itemName(row.itemId), row.warehouse?.nameAr || row.warehouse?.nameEn || row.warehouseId || '—', Number(row.quantity || 0), row.referenceNumber || '—']),
      },
      pr: {
        title: 'طلبات الشراء', columns: ['الرقم', 'التاريخ', 'الطالب', 'الحالة', 'الإجمالي'],
        rows: this.purchaseRequests.map((row) => [row.requestNumber || row.number, row.requestDate || row.createdAt, row.requestedBy || 'غير مسجل', row.status || '—', Number(row.totalAmount || 0)]),
      },
      po: {
        title: 'أوامر الشراء', columns: ['الرقم', 'التاريخ', 'المورد', 'الحالة', 'الإجمالي'],
        rows: this.purchaseOrders.map((row) => [row.orderNumber || row.number, row.orderDate || row.createdAt, row.supplier?.nameAr || row.supplier?.nameEn || row.supplierId || 'غير مسجل', row.status || '—', Number(row.totalAmount || 0)]),
      },
      grn: {
        title: 'سندات استلام البضاعة', columns: ['الرقم', 'التاريخ', 'المورد', 'المستودع', 'الحالة', 'الإجمالي'],
        rows: this.goodsReceipts.map((row) => [row.receiptNumber || row.number, row.receiptDate || row.createdAt, row.supplier?.nameAr || row.supplier?.nameEn || row.supplierId || 'غير مسجل', row.warehouse?.nameAr || row.warehouse?.nameEn || row.warehouseId || '—', row.status || '—', Number(row.totalAmount || 0)]),
      },
    };
    const selected = reports[this.tab] || reports['items'];
    return {
      title: 'Inventory Report', titleAr: selected.title, subtitle: 'مدارس روافد الشرق الأوسط العالمية',
      description: 'تقرير صادر مباشرة من نظام المخزون', columns: selected.columns, rows: selected.rows,
      summary: [{ label: 'عدد السجلات', value: selected.rows.length }, { label: 'قيمة المخزون', value: this.money(this.totals.stockValue) }],
      chart: { labels: ['الأصناف', 'المستودعات', 'الحركات'], values: [this.items.length, this.warehouses.length, this.movements.length] },
      fileName: `rawafed-inventory-${this.tab}`, direction: 'rtl', locale: 'ar',
    };
  }

  private ensureDefaultWarehouse(): void {
    const warehouseId = this.warehouses[0]?.id || '';
    this.itemForm.defaultWarehouseId ||= warehouseId;
    this.movementForm.warehouseId ||= warehouseId;
    this.grnForm.warehouseId ||= warehouseId;
    this.issueForm.warehouseId ||= warehouseId;
  }

  private async runInventoryAction(message: string, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
      await this.load();
      this.feedback.success(message);
    } catch (error) {
      this.feedback.error('Inventory action failed.', safeErrorMessage(error));
    }
  }

  private emptyItem(): any {
    return { nameAr: '', nameEn: '', category: 'Books', subcategory: '', unit: 'Each', barcode: '', qrCode: '', purchasePrice: 0, sellingPrice: 0, vatType: 'Taxable', minimumStock: 0, maximumStock: 0, reorderPoint: 0, safetyStock: 0, openingQuantity: 0, openingValue: 0, defaultWarehouseId: '', supplierId: '', brand: '', description: '', taxable: true, vatRate: 15, status: 'active', notes: '' };
  }

  private emptyWarehouse(): any {
    return { code: '', name: '', nameAr: '', nameEn: '', location: '', responsibleEmployee: '', description: '', status: 'active' };
  }

  private emptyMovement(): any {
    return { movementType: 'Stock In', date: new Date().toISOString().slice(0, 10), referenceNo: '', itemId: '', quantity: 1, unitCost: 0, warehouseId: '', toWarehouseId: '', reason: '' };
  }

  private emptyPurchaseRequest(): any {
    return { department: 'Administration', requestedBy: '', reason: '', priority: 'Normal', expectedDate: '', status: 'Draft', items: [{ itemId: '', quantity: 1, reason: '' }] };
  }

  private emptyPurchaseOrder(): any {
    return { requestId: '', supplierId: '', deliveryDate: '', paymentTerms: '', status: 'Draft', items: [{ itemId: '', quantity: 1, unitPrice: 0, vatRate: 15 }] };
  }

  private emptyGoodsReceipt(): any {
    return {
      idempotencyKey: crypto.randomUUID(),
      poId: '',
      supplierId: '',
      warehouseId: '',
      receivedDate: new Date().toISOString().slice(0, 10),
      supplierInvoiceNo: '',
      items: [{ itemId: '', quantity: 1, unitPrice: 0, vatRate: 15 }]
    };
  }

  private emptyIssue(): any {
    return { customerId: '', itemId: '', warehouseId: '', quantity: 1, date: new Date().toISOString().slice(0, 10), billable: true, sellingPrice: 0, reason: 'Books/uniform issued to student' };
  }
}
