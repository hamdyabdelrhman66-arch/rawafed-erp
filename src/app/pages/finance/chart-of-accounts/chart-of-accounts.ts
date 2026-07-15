import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';

interface AccountRow extends AccountingAccount {
  level: number;
  hasChildren: boolean;
}

@Component({
  selector: 'app-chart-of-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chart-of-accounts.html',
  styleUrls: ['./chart-of-accounts.css', '../../../shared/finance/finance-ui.scss']
})
export class ChartOfAccounts implements OnInit {
  accounts: AccountingAccount[] = [];
  searchText = '';
  typeFilter = '';
  statusFilter = '';
  selectedId = '';
  accountDetails: any = null;
  drawerOpen = false;
  detailsLoading = false;
  drawerTab: 'overview' | 'transactions' | 'movement' | 'links' | 'audit' = 'overview';
  expanded = new Set<string>();
  modalOpen = false;
  modalMode: 'create' | 'edit' = 'create';
  errorMessage = '';
  form = this.emptyAccount();
  accountTypes = [
    { value: 'asset', label: 'Asset' },
    { value: 'liability', label: 'Liability' },
    { value: 'equity', label: 'Equity' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'expense', label: 'Expense' }
  ];
  statuses = ['active', 'inactive', 'archived'];

  constructor(
    private readonly accounting: AccountingService,
    private readonly auth: AuthService,
    private readonly feedback: FeedbackService,
    public readonly i18n: I18nService,
    private readonly reportExport: ReportExportService,
  ) {}

  get canWrite(): boolean {
    return this.auth.canAccess(['Finance', 'Finance Manager', 'Chief Accountant']);
  }

  get canFullAccess(): boolean {
    return this.auth.canAccess(['Finance', 'Finance Manager']);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  get selectedAccount(): AccountingAccount | undefined {
    return this.accounts.find((account) => account.id === this.selectedId);
  }

  get parentAccounts(): AccountingAccount[] {
    return this.accounts.filter((account) => account.id !== this.selectedId && !this.isDescendant(account.id, this.selectedId));
  }

  get visibleRows(): AccountRow[] {
    const query = this.searchText.trim().toLowerCase();
    const matches = (account: AccountingAccount) => {
      const text = [account.code, account.nameAr, account.nameEn, account.type, account.status].join(' ').toLowerCase();
      return (!query || text.includes(query)) &&
        (!this.typeFilter || account.type === this.typeFilter) &&
        (!this.statusFilter || account.status === this.statusFilter);
    };
    const rows: AccountRow[] = [];
    const visit = (parentId: string | undefined, level: number): boolean => {
      let subtreeMatched = false;
      this.childrenOf(parentId).forEach((account) => {
        const childRowsBefore = rows.length;
        const directMatch = matches(account);
        const canShowChildren = !query && !this.typeFilter && !this.statusFilter ? this.expanded.has(account.id) : true;
        let childMatched = false;
        if (canShowChildren) childMatched = visit(account.id, level + 1);
        const shouldShow = directMatch || childMatched;
        if (shouldShow) {
          const childRows = rows.splice(childRowsBefore);
          rows.push({ ...account, level, hasChildren: this.childrenOf(account.id).length > 0 });
          rows.push(...childRows);
          subtreeMatched = true;
        }
      });
      return subtreeMatched;
    };
    visit(undefined, 0);
    return rows;
  }

  async load(): Promise<void> {
    this.accounts = await this.accounting.getAccounts();
    this.accounts.filter((account) => !account.parentId).forEach((account) => this.expanded.add(account.id));
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  async select(account: AccountingAccount): Promise<void> {
    this.selectedId = account.id;
    this.drawerOpen = true;
    this.drawerTab = 'overview';
    this.detailsLoading = true;
    try {
      this.accountDetails = await this.accounting.getAccountDetails(account.id);
    } catch (error) {
      this.drawerOpen = false;
      this.feedback.error(this.l('Account details could not be loaded.', 'تعذر تحميل تفاصيل الحساب.'), safeErrorMessage(error));
    } finally { this.detailsLoading = false; }
  }

  closeDrawer(): void { this.drawerOpen = false; }

  breadcrumb(account: AccountingAccount): string {
    const names: string[] = [this.accountName(account)];
    let current = account;
    const visited = new Set<string>();
    while (current.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = this.accounts.find((item) => item.id === current.parentId);
      if (!parent) break;
      names.unshift(this.accountName(parent));
      current = parent;
    }
    return [this.l('Chart of Accounts', 'دليل الحسابات'), ...names].join(' / ');
  }

  chartHeight(value: unknown, rows: any[], key: string): number {
    const max = Math.max(1, ...rows.map((row) => Math.abs(Number(row[key] || 0))));
    return Math.max(4, Math.round(Math.abs(Number(value || 0)) / max * 100));
  }

  async exportLedgerExcel(): Promise<void> {
    if (this.accountDetails) await this.reportExport.downloadExcel(this.ledgerReport());
  }

  async exportLedgerPdf(): Promise<void> {
    if (this.accountDetails) await this.reportExport.downloadPdf(this.ledgerReport());
  }

  private ledgerReport(): ReportTable {
    const details = this.accountDetails;
    const ar = this.i18n.language() === 'ar';
    return {
      title: `Account Ledger ${details.code}`,
      titleAr: `دفتر الأستاذ للحساب ${details.code}`,
      subtitle: `${details.nameAr || ''} · ${details.nameEn || ''}`,
      columns: ar
        ? ['التاريخ', 'القيد', 'الوصف', 'المرجع', 'مدين', 'دائن', 'الرصيد', 'الفرع', 'مركز التكلفة']
        : ['Date', 'Entry', 'Description', 'Reference', 'Debit', 'Credit', 'Running Balance', 'Branch', 'Cost Center'],
      rows: (details.transactions || []).map((row: any) => [row.date, row.entryNumber, row.description, row.referenceNumber || '', row.debit, row.credit, row.runningBalance, row.branch || '', row.costCenter || '']),
      summary: [
        { label: this.l('Opening Balance', 'الرصيد الافتتاحي'), value: this.money(details.openingBalance) },
        { label: this.l('Current Balance', 'الرصيد الحالي'), value: this.money(details.currentBalance) },
        { label: this.l('Debit Total', 'إجمالي المدين'), value: this.money(details.debitTotal) },
        { label: this.l('Credit Total', 'إجمالي الدائن'), value: this.money(details.creditTotal) },
        { label: this.l('Transactions', 'المعاملات'), value: details.transactionCount || 0 },
        { label: this.l('Journals', 'القيود'), value: details.journalCount || 0 },
      ],
      chart: { labels: (details.monthlyMovement || []).map((row: any) => row.period), values: (details.monthlyMovement || []).map((row: any) => Number(row.net || 0)) },
      fileName: `ledger-${details.code}`,
      direction: ar ? 'rtl' : 'ltr',
      locale: ar ? 'ar' : 'en',
      generatedBy: 'Rawafed ERP',
    };
  }

  printLedger(): void {
    const details = this.accountDetails;
    if (!details) return;
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) return;
    const rows = (details.transactions || []).map((row: any) => `<tr><td>${row.date}</td><td>${row.entryNumber}</td><td>${row.description}</td><td>${this.money(row.debit)}</td><td>${this.money(row.credit)}</td><td>${this.money(row.runningBalance)}</td></tr>`).join('');
    popup.document.write(`<html><head><title>Ledger ${details.code}</title><style>body{font-family:Arial;padding:30px;color:#14233b}h1{color:#123d73}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#123d73;color:white}</style></head><body><h1>${details.code} · ${details.nameEn}</h1><p>${details.nameAr || ''}</p><p>Opening ${this.money(details.openingBalance)} · Current ${this.money(details.currentBalance)} · Debit ${this.money(details.debitTotal)} · Credit ${this.money(details.creditTotal)}</p><table><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }

  createJournalForAccount(): void {
    window.location.href = `/finance/accounting?tab=journal&accountId=${encodeURIComponent(this.selectedId)}`;
  }

  toggle(account: AccountingAccount): void {
    if (this.expanded.has(account.id)) this.expanded.delete(account.id);
    else this.expanded.add(account.id);
  }

  expandAll(): void {
    this.accounts.forEach((account) => this.expanded.add(account.id));
  }

  collapseAll(): void {
    this.expanded.clear();
  }

  async newParent(): Promise<void> {
    if (!this.canWrite) return;
    this.modalMode = 'create';
    this.form = this.emptyAccount();
    this.form.postingAccount = false;
    await this.suggestCode();
    this.modalOpen = true;
  }

  async newChild(): Promise<void> {
    if (!this.canWrite) return;
    const parent = this.selectedAccount;
    this.modalMode = 'create';
    this.form = this.emptyAccount();
    if (parent) {
      this.form.parentId = parent.id;
      this.form.type = parent.type;
      this.form.normalBalance = parent.normalBalance || this.form.normalBalance;
    }
    await this.suggestCode();
    this.modalOpen = true;
  }

  editSelected(): void {
    if (!this.selectedAccount || !this.canWrite) return;
    this.modalMode = 'edit';
    const account = this.selectedAccount;
    this.form = {
      code: account.code,
      nameAr: account.nameAr,
      nameEn: account.nameEn,
      type: account.type,
      parentId: account.parentId || '',
      normalBalance: account.normalBalance || this.defaultNormalBalance(account.type),
      postingAccount: account.postingAccount !== false,
      openingBalance: account.openingBalance || 0,
      openingDate: account.openingDate || '',
      currency: account.currency || 'SAR',
      status: account.status || 'active',
      notes: account.notes || '',
      isCashAccount: Boolean(account.isCashAccount),
      isBankAccount: Boolean(account.isBankAccount),
      isVatAccount: Boolean(account.isVatAccount),
      isReceivableAccount: Boolean(account.isReceivableAccount),
      isPayableAccount: Boolean(account.isPayableAccount)
    };
    this.modalOpen = true;
  }

  async save(): Promise<void> {
    if (!this.canWrite) return;
    this.errorMessage = '';
    try {
      const payload = { ...this.form, parentId: this.form.parentId || undefined };
      if (this.modalMode === 'edit' && this.selectedId) await this.accounting.updateAccount(this.selectedId, payload);
      else await this.accounting.createAccount(payload);
      this.closeModal();
      await this.load();
      this.feedback.success(this.l('Account saved successfully.', 'تم حفظ الحساب بنجاح.'));
    } catch (error: any) {
      this.errorMessage = safeErrorMessage(error);
      this.feedback.error(this.l('Account could not be saved.', 'تعذر حفظ الحساب.'), this.errorMessage);
    }
  }

  async archiveSelected(): Promise<void> {
    if (!this.selectedAccount || !this.canFullAccess) return;
    const accountCode = this.selectedAccount.code;
    const confirmed = await this.feedback.confirm({
      title: this.l('Archive Account?', 'أرشفة الحساب؟'),
      message: this.l(`Account ${accountCode} will be archived and hidden from active account lists.`, `سيتم أرشفة الحساب ${accountCode} وإخفاؤه من قوائم الحسابات النشطة.`),
      confirmText: this.l('Archive', 'أرشفة'),
      tone: 'warning'
    });
    if (!confirmed) return;
    await this.accounting.archiveAccount(this.selectedAccount.id);
    await this.load();
    this.feedback.success(this.l(`Account ${accountCode} archived successfully.`, `تمت أرشفة الحساب ${accountCode} بنجاح.`));
  }

  async deleteSelected(): Promise<void> {
    if (!this.selectedAccount || !this.canFullAccess) return;
    const accountCode = this.selectedAccount.code;
    const confirmed = await this.feedback.confirm({
      title: this.l('Delete Account?', 'حذف الحساب؟'),
      message: this.l(`Account ${accountCode} will be deleted only if no journal entries exist.`, `سيتم حذف الحساب ${accountCode} فقط إذا لم توجد عليه قيود يومية.`),
      confirmText: this.l('Delete', 'حذف'),
      tone: 'danger'
    });
    if (!confirmed) return;
    this.errorMessage = '';
    try {
      await this.accounting.deleteAccount(this.selectedAccount.id);
      this.selectedId = '';
      await this.load();
      this.feedback.success(this.l(`Account ${accountCode} deleted successfully.`, `تم حذف الحساب ${accountCode} بنجاح.`));
    } catch (error: any) {
      this.errorMessage = safeErrorMessage(error) || this.l('This account cannot be deleted because accounting transactions already exist.', 'لا يمكن حذف الحساب لوجود حركات محاسبية مرتبطة به.');
      this.feedback.error(this.l('Account could not be deleted.', 'تعذر حذف الحساب.'), this.errorMessage);
      this.modalOpen = false;
    }
  }

  exportExcel(): void {
    const header = ['Code', 'Arabic Name', 'English Name', 'Type', 'Parent', 'Opening', 'Current', 'Debit', 'Credit', 'Journal Entries', 'Status'];
    const rows = this.accounts.map((account) => [
      account.code,
      account.nameAr,
      account.nameEn,
      account.type,
      account.parentCode || '',
      account.openingBalance || 0,
      account.currentBalance || 0,
      account.debit || 0,
      account.credit || 0,
      account.journalEntries || 0,
      account.status
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    this.downloadCsv('chart-of-accounts.csv', [header, ...rows]);
    this.feedback.success(this.l('Chart of Accounts exported successfully.', 'تم تصدير دليل الحسابات بنجاح.'));
  }

  importPlaceholder(): void {
    this.errorMessage = this.l('Import is ready for the Excel template workflow. Use Export Excel as the current template.', 'الاستيراد جاهز للعمل من خلال قالب Excel. استخدم تصدير Excel كقالب حالي.');
    this.feedback.info(this.l('Import template workflow is ready.', 'مسار استيراد القالب جاهز.'), this.l('Use Export Excel as the current template.', 'استخدم تصدير Excel كقالب حالي.'));
  }

  downloadTemplate(): void {
    const header = ['Account Code', 'Arabic Name', 'English Name', 'Parent Code', 'Account Type', 'Normal Balance', 'Posting Account', 'Currency', 'Opening Balance', 'Description', 'Status'];
    const sample = ['1114', 'حساب جديد', 'New Account', '1110', 'asset', 'debit', 'Yes', 'SAR', '0', 'Optional description', 'active'];
    const csv = [header, sample].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chart-of-accounts-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
    this.feedback.success(this.l('Chart of Accounts template downloaded successfully.', 'تم تحميل قالب دليل الحسابات بنجاح.'));
  }

  closeModal(): void {
    this.modalOpen = false;
    this.errorMessage = '';
  }

  async onParentOrTypeChange(): Promise<void> {
    if (this.modalMode === 'create') await this.suggestCode();
  }

  canEditCode(): boolean {
    return this.modalMode === 'create' || !this.selectedAccount?.hasTransactions;
  }

  canEditOpening(): boolean {
    return this.modalMode === 'create' || !this.selectedAccount?.hasTransactions;
  }

  money(value: unknown): string {
    return Number(value || 0).toLocaleString(this.i18n.language() === 'ar' ? 'ar-SA' : 'en-US', { maximumFractionDigits: 2 });
  }

  l(en: string, ar: string): string { return this.i18n.label(en, ar); }

  accountName(account: AccountingAccount | undefined): string {
    if (!account) return '';
    return this.i18n.language() === 'ar' ? (account.nameAr || account.nameEn) : (account.nameEn || account.nameAr);
  }

  accountTypeLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      asset: ['Asset', 'أصول'], liability: ['Liability', 'خصوم'], equity: ['Equity', 'حقوق ملكية'],
      revenue: ['Revenue', 'إيرادات'], expense: ['Expense', 'مصروفات']
    };
    const label = labels[String(value || '').toLowerCase()];
    return label ? this.l(label[0], label[1]) : value;
  }

  statusLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      active: ['Active', 'نشط'], inactive: ['Inactive', 'غير نشط'], archived: ['Archived', 'مؤرشف']
    };
    const label = labels[String(value || '').toLowerCase()];
    return label ? this.l(label[0], label[1]) : value;
  }

  normalBalanceLabel(value: string): string {
    return String(value).toLowerCase() === 'credit' ? this.l('Credit', 'دائن') : this.l('Debit', 'مدين');
  }

  flagText(account: AccountingAccount): string {
    return [
      account.postingAccount === false ? this.l('Header', 'رئيسي') : this.l('Posting', 'ترحيل'),
      account.isCashAccount ? this.l('Cash', 'نقدي') : '',
      account.isBankAccount ? this.l('Bank', 'بنك') : '',
      account.isVatAccount ? this.l('VAT', 'ضريبة') : '',
      account.isReceivableAccount ? this.l('Receivable', 'مدينون') : '',
      account.isPayableAccount ? this.l('Payable', 'دائنون') : ''
    ].filter(Boolean).join(', ');
  }

  private async suggestCode(): Promise<void> {
    const result = await this.accounting.suggestAccountCode(this.form.parentId, this.form.type);
    this.form.code = result.code;
  }

  private downloadCsv(filename: string, rows: any[][]): void {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }

  private childrenOf(parentId?: string): AccountingAccount[] {
    return this.accounts.filter((account) => (account.parentId || undefined) === parentId).sort((a, b) => a.code.localeCompare(b.code));
  }

  private isDescendant(accountId: string, possibleAncestorId: string): boolean {
    if (!possibleAncestorId) return false;
    let current = this.accounts.find((account) => account.id === accountId);
    const visited = new Set<string>();
    while (current?.parentId) {
      if (current.parentId === possibleAncestorId) return true;
      if (visited.has(current.parentId)) return true;
      visited.add(current.parentId);
      current = this.accounts.find((account) => account.id === current?.parentId);
    }
    return false;
  }

  private defaultNormalBalance(type: string): 'debit' | 'credit' {
    return ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
  }

  private emptyAccount(): any {
    return {
      code: '',
      nameAr: '',
      nameEn: '',
      type: 'asset',
      parentId: '',
      normalBalance: 'debit',
      postingAccount: true,
      openingBalance: 0,
      openingDate: '',
      currency: 'SAR',
      status: 'active',
      notes: '',
      isCashAccount: false,
      isBankAccount: false,
      isVatAccount: false,
      isReceivableAccount: false,
      isPayableAccount: false
    };
  }
}
