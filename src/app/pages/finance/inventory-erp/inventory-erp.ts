import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { InventoryService } from '../../../core/inventory/inventory.service';

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
    private readonly router: Router
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
    await this.inventory.createItem(this.itemForm);
    this.itemForm = this.emptyItem();
    await this.load();
  }

  async saveWarehouse(): Promise<void> {
    await this.inventory.createWarehouse(this.warehouseForm);
    this.warehouseForm = this.emptyWarehouse();
    await this.load();
  }

  async saveMovement(): Promise<void> {
    await this.inventory.createMovement(this.movementForm);
    this.movementForm = this.emptyMovement();
    await this.load();
  }

  async savePurchaseRequest(): Promise<void> {
    await this.inventory.createPurchaseRequest(this.prForm);
    this.prForm = this.emptyPurchaseRequest();
    await this.load();
  }

  async setPurchaseRequestStatus(request: any, status: string): Promise<void> {
    await this.inventory.updatePurchaseRequestStatus(request.id, status);
    await this.load();
  }

  async savePurchaseOrder(): Promise<void> {
    await this.inventory.createPurchaseOrder(this.poForm);
    this.poForm = this.emptyPurchaseOrder();
    await this.load();
  }

  async setPurchaseOrderStatus(order: any, status: string): Promise<void> {
    await this.inventory.updatePurchaseOrderStatus(order.id, status);
    await this.load();
  }

  async saveGoodsReceipt(): Promise<void> {
    await this.inventory.createGoodsReceipt(this.grnForm);
    this.grnForm = this.emptyGoodsReceipt();
    await this.load();
  }

  async issueToStudent(): Promise<void> {
    await this.inventory.issueToStudent(this.issueForm);
    this.issueForm = this.emptyIssue();
    await this.load();
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

  print(): void {
    window.print();
  }

  private ensureDefaultWarehouse(): void {
    const warehouseId = this.warehouses[0]?.id || '';
    this.itemForm.defaultWarehouseId ||= warehouseId;
    this.movementForm.warehouseId ||= warehouseId;
    this.grnForm.warehouseId ||= warehouseId;
    this.issueForm.warehouseId ||= warehouseId;
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
    return { poId: '', supplierId: '', warehouseId: '', receivedDate: new Date().toISOString().slice(0, 10), supplierInvoiceNo: '', items: [{ itemId: '', quantity: 1, unitPrice: 0, vatRate: 15 }] };
  }

  private emptyIssue(): any {
    return { customerId: '', itemId: '', warehouseId: '', quantity: 1, date: new Date().toISOString().slice(0, 10), billable: true, sellingPrice: 0, reason: 'Books/uniform issued to student' };
  }
}
