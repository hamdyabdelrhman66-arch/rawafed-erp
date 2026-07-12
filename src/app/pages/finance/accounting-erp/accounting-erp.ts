import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountingAccount, AccountingService, JournalEntry } from '../../../core/finance/accounting.service';
import { AccountNamePipe } from '../../../core/i18n/account-name.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { StatusLabelPipe } from '../../../core/i18n/status-label.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

type AccountingTab = 'overview' | 'accounts' | 'journal' | 'ledger' | 'trial';
type AccountFormMode = 'details' | 'create' | 'edit';
type AccountFormModel = {
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  parentId: string;
  openingBalance: number;
  openingDate: string;
  currency: string;
  status: string;
  notes: string;
  normalBalance: 'debit' | 'credit';
  postingAccount: boolean;
  isCashAccount: boolean;
  isBankAccount: boolean;
  isVatAccount: boolean;
  isReceivableAccount: boolean;
  isPayableAccount: boolean;
};

@Component({
  selector: 'app-accounting-erp',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, StatusLabelPipe, AccountNamePipe, SearchableSelectComponent],
  templateUrl: './accounting-erp.html',
  styleUrls: ['./accounting-erp.css', '../../../shared/finance/finance-ui.scss']
})
export class AccountingErp implements OnInit {
  activeTab: AccountingTab = 'overview';
  loading = false;
  error = '';

  accounts: AccountingAccount[] = [];
  entries: JournalEntry[] = [];
  ledger: any;
  trialBalance: any;
  dashboard: any;
  costCenters: Array<{ id: string; code: string; nameEn: string; nameAr: string }> = [];
  selectedJournal: JournalEntry | null = null;
  editingJournalId = '';
  selectedAccount: AccountingAccount | null = null;
  accountModalMode: AccountFormMode = 'details';
  accountFormOpen = false;
  accountForm: AccountFormModel = this.emptyAccountForm();
  accountLedgerPreview: any = null;

  selectedAccountId = '';
  fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  toDate = new Date().toISOString().slice(0, 10);
  trialDisplayMode: 'activity' | 'balance' | 'all' = 'activity';
  trialAccountType = '';
  trialParentAccountId = '';
  trialBranch = '';
  trialCostCenterId = '';
  trialCurrency = '';
  trialAccountStatus = 'active';
  trialSearch = '';
  trialReportScope = 'standard';
  showParentAccounts = false;
  readonly branchOptions = [{ id: 'main', name: 'Main Branch' }];
  readonly currencyOptions = ['SAR'];
  collapsedTrialAccounts = new Set<string>();
  readonly accountOptionLabel = (account: AccountingAccount) => this.accountDisplayName(account);

  draftEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    referenceNumber: '',
    description: '',
    status: 'posted' as 'draft' | 'posted',
    lines: [
      { accountId: '', description: '', debit: 0, credit: 0 },
      { accountId: '', description: '', debit: 0, credit: 0 }
    ]
  };

  constructor(
    private readonly accounting: AccountingService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as AccountingTab | null;
      if (tab && ['overview', 'accounts', 'journal', 'ledger', 'trial'].includes(tab)) {
        this.activeTab = tab;
      } else {
        this.activeTab = 'overview';
      }
    });
    void this.load();
  }

  setActiveTab(tab: AccountingTab): void {
    this.activeTab = tab;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: tab === 'overview' ? {} : { tab },
      queryParamsHandling: 'replace'
    });
  }

  get accountCount(): number {
    return this.accounts.length;
  }

  get postedEntries(): number {
    return this.entries.filter((entry) => entry.status === 'posted').length;
  }

  get totalDebit(): number {
    return Number(this.trialBalance?.totals?.periodDebit || 0);
  }

  get totalCredit(): number {
    return Number(this.trialBalance?.totals?.periodCredit || 0);
  }

  get balanced(): boolean {
    return Boolean(this.trialBalance?.balanced);
  }

  get trialRows(): any[] {
    return this.trialBalance?.rows || [];
  }

  get trialTotals(): any {
    return this.trialBalance?.totals || {};
  }

  get parentAccounts(): AccountingAccount[] {
    const parentIds = new Set(this.accounts.filter((account) => account.parentId).map((account) => account.parentId));
    return this.accounts.filter((account) => parentIds.has(account.id));
  }

  get accountTypeOptions(): string[] {
    return ['asset', 'liability', 'equity', 'revenue', 'expense'];
  }

  get accountModalTitle(): string {
    if (this.accountModalMode === 'create') return this.i18n.t('accounting.new_account');
    if (this.accountModalMode === 'edit') return this.i18n.t('accounting.edit_account');
    return this.i18n.t('accounting.account_details');
  }

  get accountDetailRows(): Array<{ label: string; value: string }> {
    const account = this.selectedAccount;
    if (!account) return [];
    return [
      { label: this.i18n.t('common.code'), value: account.code },
      { label: this.i18n.t('accounting.english_name'), value: account.nameEn || '-' },
      { label: this.i18n.t('accounting.arabic_name'), value: account.nameAr || '-' },
      { label: this.i18n.t('common.type'), value: this.i18n.t(`type.${account.type}`) },
      { label: this.i18n.t('common.parent'), value: this.accountDisplayName(this.findAccount(account.parentId)) },
      { label: this.i18n.t('common.opening'), value: this.money(account.openingBalance) },
      { label: this.i18n.t('accounting.current_balance'), value: this.money(account.currentBalance) },
      { label: this.i18n.t('accounting.debit_total'), value: this.money(account.debit) },
      { label: this.i18n.t('accounting.credit_total'), value: this.money(account.credit) },
      { label: this.i18n.t('accounting.journal_entries'), value: String(account.journalEntries || 0) },
      { label: this.i18n.t('common.status'), value: this.i18n.status(account.status) }
    ];
  }

  get selectedAccountFlags(): string[] {
    const account = this.selectedAccount;
    if (!account) return [];
    const flags = [
      account.postingAccount ? this.i18n.t('accounting.posting_account') : '',
      account.isCashAccount ? this.i18n.t('accounting.cash_account') : '',
      account.isBankAccount ? this.i18n.t('accounting.bank_account') : '',
      account.isVatAccount ? this.i18n.t('accounting.vat_account') : '',
      account.isReceivableAccount ? this.i18n.t('accounting.receivable_account') : '',
      account.isPayableAccount ? this.i18n.t('accounting.payable_account') : ''
    ];
    return flags.filter(Boolean);
  }

  get visibleTrialRows(): any[] {
    if (!this.showParentAccounts) return this.trialRows;
    const rowsById = new Map(this.trialRows.map((row) => [row.accountId, row]));
    return this.trialRows.filter((row) => {
      let parentId = row.parentId;
      while (parentId) {
        if (this.collapsedTrialAccounts.has(parentId)) return false;
        parentId = rowsById.get(parentId)?.parentId;
      }
      return true;
    });
  }

  get accountTypes(): Array<{ type: string; count: number }> {
    return ['asset', 'liability', 'equity', 'revenue', 'expense'].map((type) => ({
      type,
      count: this.accounts.filter((account) => account.type === type).length
    }));
  }

  get kpiCards(): Array<{ label: string; value: number; note: string }> {
    const kpis = this.dashboard?.kpis || {};
    return [
      { label: this.i18n.t('finance.kpi.cash_balance'), value: kpis.cashBalance, note: this.i18n.t('finance.kpi.cash_balance_note_full') },
      { label: this.i18n.t('finance.kpi.bank_balance'), value: kpis.bankBalance, note: this.i18n.t('finance.kpi.bank_balance_note') },
      { label: this.i18n.t('finance.kpi.accounts_receivable'), value: kpis.accountsReceivable, note: this.i18n.t('finance.kpi.accounts_receivable_note') },
      { label: this.i18n.t('finance.kpi.accounts_payable'), value: kpis.accountsPayable, note: this.i18n.t('finance.kpi.accounts_payable_note') },
      { label: this.i18n.t('finance.kpi.fixed_assets'), value: kpis.fixedAssets, note: this.i18n.t('finance.kpi.fixed_assets_note') },
      { label: this.i18n.t('finance.kpi.current_assets'), value: kpis.currentAssets, note: this.i18n.t('finance.kpi.current_assets_note') },
      { label: this.i18n.t('finance.kpi.current_liabilities'), value: kpis.currentLiabilities, note: this.i18n.t('finance.kpi.current_liabilities_note') },
      { label: this.i18n.t('finance.kpi.vat_receivable'), value: kpis.vatReceivable, note: this.i18n.t('finance.kpi.vat_receivable_note') },
      { label: this.i18n.t('finance.kpi.vat_payable'), value: kpis.vatPayable, note: this.i18n.t('finance.kpi.vat_payable_note') },
      { label: this.i18n.t('finance.kpi.net_profit'), value: kpis.netProfit, note: this.i18n.t('finance.kpi.net_profit_note') },
      { label: this.i18n.t('finance.kpi.owner_equity'), value: kpis.ownerEquity, note: this.i18n.t('finance.kpi.owner_equity_note') }
    ];
  }

  get workflowCards(): Array<{ label: string; value: number }> {
    const workflow = this.dashboard?.workflow || {};
    return [
      { label: this.i18n.t('accounting.pending_approvals'), value: workflow.pendingApprovals || 0 },
      { label: this.i18n.t('accounting.draft_journals'), value: workflow.draftJournals || 0 },
      { label: this.i18n.t('accounting.unposted_journals'), value: workflow.unpostedJournals || 0 }
    ];
  }

  get debitTotal(): number {
    return this.draftEntry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  }

  get creditTotal(): number {
    return this.draftEntry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [accounts, entries, trialBalance, _costCenters, dashboard] = await Promise.all([
        this.accounting.getAccounts(),
        this.accounting.getJournalEntries(),
        this.loadTrialBalance(),
        this.loadCostCenters(),
        this.accounting.getDashboard(this.fromDate, this.toDate)
      ]);
      this.accounts = accounts;
      this.entries = entries;
      this.trialBalance = trialBalance;
      this.dashboard = dashboard;
      this.selectedAccountId ||= accounts.find((account) => account.systemKey === 'main-cashbox')?.id || accounts[0]?.id || '';
      await this.loadLedger();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not load accounting data.';
    } finally {
      this.loading = false;
    }
  }

  async loadLedger(): Promise<void> {
    if (!this.selectedAccountId) return;
    this.ledger = await this.accounting.getLedger(this.selectedAccountId, this.fromDate, this.toDate);
  }

  accountDisplayName(account: AccountingAccount | null | undefined): string {
    if (!account) return '-';
    return `${account.code} - ${this.i18n.label(account.nameEn || '-', account.nameAr)}`;
  }

  findAccount(id?: string): AccountingAccount | undefined {
    return id ? this.accounts.find((account) => account.id === id) : undefined;
  }

  isParentAccount(account: AccountingAccount): boolean {
    return this.accounts.some((item) => item.parentId === account.id);
  }

  async openAccountDetails(account: AccountingAccount): Promise<void> {
    this.selectedAccount = account;
    this.selectedAccountId = account.id;
    this.accountModalMode = 'details';
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    try {
      this.accountLedgerPreview = await this.accounting.getLedger(account.id, this.fromDate, this.toDate);
    } catch {
      this.accountLedgerPreview = { transactions: [] };
    }
  }

  async openNewParentAccount(): Promise<void> {
    this.selectedAccount = null;
    this.accountModalMode = 'create';
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    this.accountForm = this.emptyAccountForm();
    await this.suggestCodeForForm();
  }

  async openNewChildAccount(parent?: AccountingAccount | null): Promise<void> {
    const selectedParent = parent || this.selectedAccount;
    this.accountModalMode = 'create';
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    this.accountForm = this.emptyAccountForm({
      parentId: selectedParent?.id || '',
      type: selectedParent?.type || 'asset',
      normalBalance: selectedParent?.normalBalance || this.defaultNormalBalance(selectedParent?.type || 'asset')
    });
    await this.suggestCodeForForm();
  }

  editSelectedAccount(): void {
    if (!this.selectedAccount) return;
    const account = this.selectedAccount;
    this.accountModalMode = 'edit';
    this.accountForm = this.emptyAccountForm({
      id: account.id,
      code: account.code,
      nameAr: account.nameAr || '',
      nameEn: account.nameEn || '',
      type: account.type || 'asset',
      parentId: account.parentId || '',
      openingBalance: Number(account.openingBalance || 0),
      openingDate: account.openingDate || '',
      currency: account.currency || 'SAR',
      status: account.status || 'active',
      notes: account.notes || '',
      normalBalance: account.normalBalance || this.defaultNormalBalance(account.type || 'asset'),
      postingAccount: account.postingAccount !== false,
      isCashAccount: Boolean(account.isCashAccount),
      isBankAccount: Boolean(account.isBankAccount),
      isVatAccount: Boolean(account.isVatAccount),
      isReceivableAccount: Boolean(account.isReceivableAccount),
      isPayableAccount: Boolean(account.isPayableAccount)
    });
  }

  async saveAccountForm(): Promise<void> {
    this.error = '';
    const payload = {
      ...this.accountForm,
      parentId: this.accountForm.parentId || null,
      openingBalance: Number(this.accountForm.openingBalance || 0)
    };
    try {
      const saved = this.accountModalMode === 'edit' && this.accountForm.id
        ? await this.accounting.updateAccount(this.accountForm.id, payload)
        : await this.accounting.createAccount(payload);
      this.accounts = await this.accounting.getAccounts();
      this.selectedAccount = this.findAccount(saved.id) || saved;
      this.accountModalMode = 'details';
      await this.openAccountDetails(this.selectedAccount);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save account.';
    }
  }

  closeAccountModal(): void {
    this.accountFormOpen = false;
    this.accountModalMode = 'details';
    this.accountLedgerPreview = null;
  }

  onAccountTypeChange(): void {
    this.accountForm.normalBalance = this.defaultNormalBalance(this.accountForm.type);
    void this.suggestCodeForForm();
  }

  async suggestCodeForForm(): Promise<void> {
    try {
      const result = await this.accounting.suggestAccountCode(this.accountForm.parentId, this.accountForm.type);
      this.accountForm.code = result.code || this.accountForm.code;
    } catch {
      // Manual code entry remains available if code suggestion is not reachable.
    }
  }

  private emptyAccountForm(overrides: Partial<AccountFormModel> = {}): AccountFormModel {
    return {
      code: '',
      nameAr: '',
      nameEn: '',
      type: 'asset',
      parentId: '',
      openingBalance: 0,
      openingDate: '',
      currency: 'SAR',
      status: 'active',
      notes: '',
      normalBalance: 'debit',
      postingAccount: true,
      isCashAccount: false,
      isBankAccount: false,
      isVatAccount: false,
      isReceivableAccount: false,
      isPayableAccount: false,
      ...overrides
    };
  }

  private defaultNormalBalance(type: string): 'debit' | 'credit' {
    return ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
  }

  async loadTrialBalance(): Promise<any> {
    return this.accounting.getTrialBalance({
      fromDate: this.fromDate,
      toDate: this.toDate,
      displayMode: this.trialDisplayMode,
      accountType: this.trialAccountType,
      parentAccountId: this.trialParentAccountId,
      branch: this.trialBranch,
      costCenterId: this.trialCostCenterId,
      currency: this.trialCurrency,
      accountStatus: this.trialAccountStatus,
      search: this.trialSearch,
      showZeroBalances: this.trialDisplayMode === 'all',
      showParentAccounts: this.showParentAccounts
    });
  }

  async refreshTrialBalance(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.trialBalance = await this.loadTrialBalance();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not load trial balance.';
    } finally {
      this.loading = false;
    }
  }

  setTrialDisplayMode(mode: 'activity' | 'balance' | 'all'): void {
    this.trialDisplayMode = mode;
    void this.refreshTrialBalance();
  }

  toggleTrialAccount(row: any): void {
    if (!row.isParent) return;
    if (this.collapsedTrialAccounts.has(row.accountId)) {
      this.collapsedTrialAccounts.delete(row.accountId);
    } else {
      this.collapsedTrialAccounts.add(row.accountId);
    }
  }

  isTrialCollapsed(row: any): boolean {
    return this.collapsedTrialAccounts.has(row.accountId);
  }

  async openLedgerFromTrial(row: any): Promise<void> {
    this.selectedAccountId = row.accountId;
    this.setActiveTab('ledger');
    await this.loadLedger();
  }

  openJournalVoucher(journalEntryId: string): void {
    this.selectedJournal = this.entries.find((entry) => entry.id === journalEntryId) || null;
  }

  closeJournalVoucher(): void {
    this.selectedJournal = null;
  }

  async loadCostCenters(): Promise<any[]> {
    if (this.costCenters.length) return this.costCenters;
    this.costCenters = await this.accounting.getCostCenters();
    return this.costCenters;
  }

  addLine(): void {
    this.draftEntry.lines.push({ accountId: '', description: '', debit: 0, credit: 0 });
  }

  removeLine(index: number): void {
    if (this.draftEntry.lines.length <= 2) return;
    this.draftEntry.lines.splice(index, 1);
  }

  async saveJournal(): Promise<void> {
    this.error = '';
    const payload = {
      ...this.draftEntry,
      lines: this.draftEntry.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0)
      }))
    };
    try {
      if (this.editingJournalId) await this.accounting.updateJournalEntry(this.editingJournalId, payload);
      else await this.accounting.createJournalEntry(payload);
      this.resetJournalForm();
      await this.load();
      this.setActiveTab('journal');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save journal entry.';
    }
  }

  editJournal(entry: JournalEntry): void {
    if (entry.sourceType || entry.sourceId) {
      this.error = 'Only manual journal entries can be edited from here.';
      return;
    }
    this.editingJournalId = entry.id;
    this.draftEntry = {
      postingDate: entry.postingDate,
      referenceNumber: entry.referenceNumber || '',
      description: entry.description,
      status: entry.status === 'draft' ? 'draft' : 'posted',
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description || '',
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0)
      }))
    };
    this.setActiveTab('journal');
  }

  async deleteJournal(entry: JournalEntry): Promise<void> {
    if (entry.sourceType || entry.sourceId) {
      this.error = 'Only manual journal entries can be deleted from here.';
      return;
    }
    if (!confirm(`Delete journal entry ${entry.entryNumber}?`)) return;
    this.error = '';
    try {
      await this.accounting.deleteJournalEntry(entry.id);
      if (this.editingJournalId === entry.id) this.resetJournalForm();
      await this.load();
      this.setActiveTab('journal');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not delete journal entry.';
    }
  }

  resetJournalForm(): void {
    this.editingJournalId = '';
    this.draftEntry.description = '';
    this.draftEntry.referenceNumber = '';
    this.draftEntry.status = 'posted';
    this.draftEntry.postingDate = new Date().toISOString().slice(0, 10);
    this.draftEntry.lines = [
      { accountId: '', description: '', debit: 0, credit: 0 },
      { accountId: '', description: '', debit: 0, credit: 0 }
    ];
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }

  chartWidth(rows: any[] = [], key = 'value', row: any): number {
    const max = Math.max(1, ...rows.map((item) => Math.abs(Number(item[key] || 0))));
    return Math.max(4, Math.round((Math.abs(Number(row[key] || 0)) / max) * 100));
  }

  exportTrialExcel(): void {
    const headers = ['Code', 'Account', 'Type', 'Opening Debit', 'Opening Credit', 'Period Debit', 'Period Credit', 'Closing Debit', 'Closing Credit'];
    const rows = this.visibleTrialRows.map((row) => [
      row.code,
      `${' '.repeat(Number(row.level || 0) * 2)}${row.nameEn}`,
      row.type,
      row.openingDebit,
      row.openingCredit,
      row.periodDebit,
      row.periodCredit,
      row.closingDebit,
      row.closingCredit
    ]);
    rows.push(['', 'Total', '', this.trialTotals.openingDebit || 0, this.trialTotals.openingCredit || 0, this.trialTotals.periodDebit || 0, this.trialTotals.periodCredit || 0, this.trialTotals.closingDebit || 0, this.trialTotals.closingCredit || 0]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `trial-balance-${this.fromDate}-to-${this.toDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  exportTrialPdf(): void {
    window.print();
  }
}
