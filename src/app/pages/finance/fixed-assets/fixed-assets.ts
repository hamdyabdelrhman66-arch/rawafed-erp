import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FixedAssetsService } from '../../../core/finance/fixed-assets.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { I18nService } from '../../../core/i18n/i18n.service';

type Tab = 'assets' | 'categories' | 'depreciation' | 'transfers' | 'disposal' | 'maintenance' | 'reports';

@Component({
  selector: 'app-fixed-assets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fixed-assets.html',
  styleUrls: ['./fixed-assets.css', '../../../shared/finance/finance-ui.scss']
})
export class FixedAssets implements OnInit, OnDestroy {
  tab: Tab = 'assets';
  assets: any[] = [];
  categories: any[] = [];
  master: any = { branches: [], costCenters: [], suppliers: [], accounts: [] };
  selectedId = '';
  search = '';
  busy = false;
  modal: 'asset' | 'category' | 'transfer' | 'disposal' | 'maintenance' | '' = '';
  period = new Date().toISOString().slice(0, 7) + '-01';
  reportType = 'asset-register';
  reportRows: any[] = [];
  reportTypes = [
    ['asset-register', 'Asset Register'],
    ['depreciation-schedule', 'Depreciation Schedule'],
    ['asset-value', 'Asset Value'],
    ['asset-movement', 'Asset Movement'],
    ['asset-by-branch', 'Asset by Branch'],
    ['asset-by-category', 'Asset by Category']
  ];
  readonly categoryTemplates = [
    { code: 'BLDG', nameEn: 'Buildings', nameAr: 'المباني', usefulLifeMonths: 240, depreciationMethod: 'STRAIGHT_LINE' },
    { code: 'VEH', nameEn: 'Vehicles', nameAr: 'المركبات', usefulLifeMonths: 60, depreciationMethod: 'DECLINING_BALANCE', decliningRate: 30 },
    { code: 'FURN', nameEn: 'Furniture & Fixtures', nameAr: 'الأثاث والتجهيزات', usefulLifeMonths: 84, depreciationMethod: 'STRAIGHT_LINE' },
    { code: 'IT', nameEn: 'IT Equipment', nameAr: 'أجهزة وتقنية المعلومات', usefulLifeMonths: 48, depreciationMethod: 'DECLINING_BALANCE', decliningRate: 40 }
  ];
  assetForm = this.emptyAsset();
  categoryForm = this.emptyCategory();
  actionForm: any = {};
  private querySubscription?: Subscription;

  constructor(
    private readonly service: FixedAssetsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly feedback: FeedbackService,
    public readonly i18n: I18nService
  ) {}

  async ngOnInit(): Promise<void> {
    this.querySubscription = this.route.queryParamMap.subscribe((params) => {
      const requested = params.get('tab') as Tab;
      this.tab = ['assets', 'categories', 'depreciation', 'transfers', 'disposal', 'maintenance', 'reports'].includes(requested) ? requested : 'assets';
      if (this.tab === 'reports') void this.loadReport();
    });
    await this.load();
  }

  ngOnDestroy(): void { this.querySubscription?.unsubscribe(); }

  get selected(): any { return this.assets.find((asset) => asset.id === this.selectedId); }
  get filteredAssets(): any[] {
    const query = this.search.trim().toLowerCase();
    return this.assets.filter((asset) => !query || [asset.assetCode, asset.nameAr, asset.nameEn, asset.categoryNameEn, asset.branchName, asset.custodian, asset.location, asset.barcode].join(' ').toLowerCase().includes(query));
  }
  get totalCost(): number { return this.assets.reduce((sum, asset) => sum + Number(asset.purchaseCost || 0), 0); }
  get totalBookValue(): number { return this.assets.reduce((sum, asset) => sum + Number(asset.currentBookValue || 0), 0); }
  get totalDepreciation(): number { return this.totalCost - this.totalBookValue; }

  async load(): Promise<void> {
    this.busy = true;
    try {
      [this.assets, this.categories, this.master] = await Promise.all([
        this.service.assets(), this.service.categories(), this.service.masterData()
      ]);
      if (this.selectedId && !this.selected) this.selectedId = '';
    } finally { this.busy = false; }
  }

  navigate(tab: Tab): void { void this.router.navigate([], { relativeTo: this.route, queryParams: { tab } }); }
  select(asset: any): void { this.selectedId = asset.id; }
  openAsset(): void { this.assetForm = this.emptyAsset(); this.modal = 'asset'; }
  openCategory(): void { this.categoryForm = this.emptyCategory(); this.modal = 'category'; }
  openAction(type: 'transfer' | 'disposal' | 'maintenance'): void {
    if (!this.selected) { this.feedback.info('Select an asset first.'); return; }
    this.actionForm = {
      transferDate: this.today(), disposalDate: this.today(), maintenanceDate: this.today(),
      disposalType: 'DISPOSAL', maintenanceType: 'PREVENTIVE', status: 'COMPLETED', cost: 0, proceeds: 0
    };
    this.modal = type;
  }
  closeModal(): void { this.modal = ''; }

  async saveAsset(): Promise<void> {
    await this.perform('Asset acquired and accounting entry posted.', async () => this.service.createAsset(this.assetForm));
  }
  async saveCategory(): Promise<void> {
    await this.perform('Asset category created.', async () => this.service.createCategory(this.categoryForm));
  }
  async initializeCategories(): Promise<void> {
    this.busy = true;
    try {
      const existing = new Set(this.categories.map((category) => category.code));
      for (const template of this.categoryTemplates.filter((item) => !existing.has(item.code)))
        await this.service.createCategory(template);
      await this.load();
      this.feedback.success(this.l('Default asset categories created.', 'تم إنشاء فئات الأصول الافتراضية.'));
    } catch (error) {
      this.feedback.error(this.l('Categories could not be initialized.', 'تعذر تهيئة فئات الأصول.'), safeErrorMessage(error));
    } finally { this.busy = false; }
  }
  async saveAction(): Promise<void> {
    if (!this.selected) return;
    const operation = this.modal === 'transfer'
      ? this.service.transfer(this.selected.id, this.actionForm)
      : this.modal === 'disposal'
        ? this.service.dispose(this.selected.id, this.actionForm)
        : this.service.maintain(this.selected.id, this.actionForm);
    await this.perform('Asset transaction posted successfully.', async () => operation);
  }
  async depreciateSelected(): Promise<void> {
    if (!this.selected) { this.feedback.info('Select an asset first.'); return; }
    await this.perform('Monthly depreciation and journal entry posted.', async () => this.service.depreciate(this.selected.id, this.period), false);
  }
  async runAllDepreciation(): Promise<void> {
    await this.perform('Monthly depreciation run completed.', async () => this.service.runDepreciation(this.period), false);
  }
  async loadReport(): Promise<void> {
    try { this.reportRows = await this.service.report(this.reportType); }
    catch (error) { this.feedback.error('Report could not be loaded.', safeErrorMessage(error)); }
  }
  exportReport(): void {
    if (!this.reportRows.length) return;
    const columns = Object.keys(this.reportRows[0]).filter((key) => typeof this.reportRows[0][key] !== 'object');
    const csv = [columns, ...this.reportRows.map((row) => columns.map((key) => row[key] ?? ''))]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${this.reportType}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  reportColumns(): string[] { return this.reportRows[0] ? Object.keys(this.reportRows[0]).filter((key) => typeof this.reportRows[0][key] !== 'object') : []; }
  money(value: unknown): string { return Number(value || 0).toLocaleString(this.i18n.language() === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  l(en: string, ar: string): string { return this.i18n.label(en, ar); }
  methodLabel(value: string): string {
    return value === 'DECLINING_BALANCE' ? this.l('Declining Balance', 'الرصيد المتناقص') : this.l('Straight Line', 'القسط الثابت');
  }
  reportLabel(type: string): string {
    const labels: Record<string, [string, string]> = {
      'asset-register': ['Asset Register', 'سجل الأصول'],
      'depreciation-schedule': ['Depreciation Schedule', 'جدول الإهلاك'],
      'asset-value': ['Asset Value', 'قيمة الأصول'],
      'asset-movement': ['Asset Movement', 'حركة الأصول'],
      'asset-by-branch': ['Asset by Branch', 'الأصول حسب الفرع'],
      'asset-by-category': ['Asset by Category', 'الأصول حسب الفئة']
    };
    const label = labels[type] || [type, type];
    return this.l(label[0], label[1]);
  }

  private async perform(message: string, work: () => Promise<any>, close = true): Promise<void> {
    this.busy = true;
    try {
      await work();
      if (close) this.closeModal();
      await this.load();
      if (this.tab === 'reports') await this.loadReport();
      this.feedback.success(message);
    } catch (error) { this.feedback.error('Asset transaction could not be completed.', safeErrorMessage(error)); }
    finally { this.busy = false; }
  }
  private today(): string { return new Date().toISOString().slice(0, 10); }
  private emptyAsset(): any {
    return { assetCode: '', nameAr: '', nameEn: '', categoryId: '', branchId: '', costCenterId: '', supplierId: '', purchaseDate: this.today(), purchaseInvoice: '', purchaseCost: 0, residualValue: 0, usefulLifeMonths: 60, depreciationMethod: 'STRAIGHT_LINE', decliningRate: 40, paymentAccountId: '', custodian: '', location: '', barcode: '', warrantyEndsAt: '', notes: '', attachments: [] };
  }
  private emptyCategory(): any {
    return { code: '', nameAr: '', nameEn: '', usefulLifeMonths: 60, depreciationMethod: 'STRAIGHT_LINE', decliningRate: 40, assetAccountId: '', accumulatedDepreciationAccountId: '', depreciationExpenseAccountId: '', notes: '' };
  }
}
