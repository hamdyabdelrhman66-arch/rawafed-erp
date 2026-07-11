import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';

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
    private readonly auth: AuthService
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

  select(account: AccountingAccount): void {
    this.selectedId = account.id;
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
    } catch (error: any) {
      this.errorMessage = error?.error?.message || error?.message || 'Could not save account.';
    }
  }

  async archiveSelected(): Promise<void> {
    if (!this.selectedAccount || !this.canFullAccess) return;
    await this.accounting.archiveAccount(this.selectedAccount.id);
    await this.load();
  }

  async deleteSelected(): Promise<void> {
    if (!this.selectedAccount || !this.canFullAccess) return;
    this.errorMessage = '';
    try {
      await this.accounting.deleteAccount(this.selectedAccount.id);
      this.selectedId = '';
      await this.load();
    } catch (error: any) {
      this.errorMessage = error?.error?.message || 'This account cannot be deleted because accounting transactions already exist.';
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chart-of-accounts.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  importPlaceholder(): void {
    this.errorMessage = 'Import is ready for the Excel template workflow. Use Export Excel as the current template.';
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
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  flagText(account: AccountingAccount): string {
    return [
      account.postingAccount === false ? 'Header' : 'Posting',
      account.isCashAccount ? 'Cash' : '',
      account.isBankAccount ? 'Bank' : '',
      account.isVatAccount ? 'VAT' : '',
      account.isReceivableAccount ? 'Receivable' : '',
      account.isPayableAccount ? 'Payable' : ''
    ].filter(Boolean).join(', ');
  }

  private async suggestCode(): Promise<void> {
    const result = await this.accounting.suggestAccountCode(this.form.parentId, this.form.type);
    this.form.code = result.code;
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
