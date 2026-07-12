import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';

export interface AccountingAccount {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  parentId?: string;
  parentCode?: string;
  parentNameEn?: string;
  openingBalance: number;
  openingDate?: string;
  currency: string;
  status: string;
  notes?: string;
  systemKey?: string;
  normalBalance?: 'debit' | 'credit';
  postingAccount?: boolean;
  debit?: number;
  credit?: number;
  currentBalance?: number;
  journalEntries?: number;
  lastTransactionDate?: string;
  canDelete?: boolean;
  hasTransactions?: boolean;
  isCashAccount?: boolean;
  isBankAccount?: boolean;
  isVatAccount?: boolean;
  isReceivableAccount?: boolean;
  isPayableAccount?: boolean;
}

export interface JournalEntryLine {
  accountId: string;
  accountCode?: string;
  accountNameAr?: string;
  accountNameEn?: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  status: string;
  referenceNumber?: string;
  postingDate: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  createdBy?: string;
  lines: JournalEntryLine[];
}

@Injectable({ providedIn: 'root' })
export class AccountingService {
  constructor(private readonly api: ApiService) {}

  getAccounts(params: { q?: string; type?: string; status?: string } = {}): Promise<AccountingAccount[]> {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.type) search.set('type', params.type);
    if (params.status) search.set('status', params.status);
    return this.api.get<AccountingAccount[]>(`/accounting/accounts${search.toString() ? `?${search}` : ''}`);
  }

  getDashboard(fromDate = '', toDate = ''): Promise<any> {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    return this.api.get<any>(`/accounting/dashboard${params.toString() ? `?${params}` : ''}`);
  }

  createAccount(payload: any): Promise<AccountingAccount> {
    return this.api.post<AccountingAccount>('/accounting/accounts', payload);
  }

  updateAccount(id: string, payload: any): Promise<AccountingAccount> {
    return this.api.patch<AccountingAccount>(`/accounting/accounts/${id}`, payload);
  }

  deleteAccount(id: string): Promise<AccountingAccount> {
    return this.api.delete<AccountingAccount>(`/accounting/accounts/${id}`);
  }

  archiveAccount(id: string): Promise<AccountingAccount> {
    return this.api.patch<AccountingAccount>(`/accounting/accounts/${id}/archive`, {});
  }

  moveAccount(id: string, parentId: string | null): Promise<AccountingAccount> {
    return this.api.patch<AccountingAccount>(`/accounting/accounts/${id}/move`, { parentId });
  }

  suggestAccountCode(parentId = '', type = 'asset'): Promise<{ code: string }> {
    const params = new URLSearchParams();
    if (parentId) params.set('parentId', parentId);
    if (type) params.set('type', type);
    return this.api.get<{ code: string }>(`/accounting/accounts/suggest-code?${params}`);
  }

  deactivateAccount(id: string): Promise<AccountingAccount> {
    return this.archiveAccount(id);
  }

  getExpenseAccounts(): Promise<AccountingAccount[]> {
    return this.api.get<AccountingAccount[]>('/accounting/expense-accounts');
  }

  getPaymentAccounts(): Promise<AccountingAccount[]> {
    return this.api.get<AccountingAccount[]>('/accounting/payment-accounts');
  }

  getRevenueAccounts(): Promise<AccountingAccount[]> {
    return this.api.get<AccountingAccount[]>('/accounting/revenue-accounts');
  }

  getReceivableAccounts(): Promise<AccountingAccount[]> {
    return this.api.get<AccountingAccount[]>('/accounting/receivable-accounts');
  }

  getPayableAccounts(): Promise<AccountingAccount[]> {
    return this.api.get<AccountingAccount[]>('/accounting/payable-accounts');
  }

  getCashboxes(): Promise<any[]> {
    return this.api.get<any[]>('/accounting/cashboxes');
  }

  createCashbox(payload: any): Promise<any> {
    return this.api.post<any>('/accounting/cashboxes', payload);
  }

  updateCashbox(id: string, payload: any): Promise<any> {
    return this.api.patch<any>(`/accounting/cashboxes/${id}`, payload);
  }

  getBanks(): Promise<any[]> {
    return this.api.get<any[]>('/accounting/banks');
  }

  createBank(payload: any): Promise<any> {
    return this.api.post<any>('/accounting/banks', payload);
  }

  updateBank(id: string, payload: any): Promise<any> {
    return this.api.patch<any>(`/accounting/banks/${id}`, payload);
  }

  createTransfer(payload: any): Promise<JournalEntry> {
    return this.api.post<JournalEntry>('/accounting/transfers', payload);
  }

  getCostCenters(): Promise<Array<{ id: string; code: string; nameAr: string; nameEn: string; status: string }>> {
    return this.api.get<Array<{ id: string; code: string; nameAr: string; nameEn: string; status: string }>>('/accounting/cost-centers');
  }

  getSuppliers(): Promise<any[]> {
    return this.api.get<any[]>('/accounting/suppliers');
  }

  getCustomers(): Promise<any[]> {
    return this.api.get<any[]>('/accounting/customers');
  }

  getCustomer(id: string): Promise<any> {
    return this.api.get<any>(`/accounting/customers/${id}`);
  }

  getCustomerStatement(id: string, fromDate = '', toDate = ''): Promise<any> {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    return this.api.get<any>(`/accounting/customers/${id}/statement${params.toString() ? `?${params}` : ''}`);
  }

  getCustomerInstallments(id: string): Promise<any> {
    return this.api.get<any>(`/accounting/customers/${id}/installments`);
  }

  createCustomerInstallmentPlan(id: string, payload: any): Promise<any> {
    return this.api.post<any>(`/accounting/customers/${id}/installment-plans`, payload);
  }

  createSupplier(payload: any): Promise<any> {
    return this.api.post<any>('/accounting/suppliers', payload);
  }

  updateSupplier(id: string, payload: any): Promise<any> {
    return this.api.patch<any>(`/accounting/suppliers/${id}`, payload);
  }

  deactivateSupplier(id: string): Promise<any> {
    return this.api.delete<any>(`/accounting/suppliers/${id}`);
  }

  getSupplierProfile(id: string): Promise<any> {
    return this.api.get<any>(`/accounting/suppliers/${id}/profile`);
  }

  getSupplierStatement(id: string, fromDate = '', toDate = ''): Promise<any> {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    return this.api.get<any>(`/accounting/suppliers/${id}/statement${params.toString() ? `?${params}` : ''}`);
  }

  createSupplierPayment(payload: any): Promise<any> {
    return this.api.post<any>('/accounting/supplier-payments', payload);
  }

  getSupplierAging(): Promise<any> {
    return this.api.get<any>('/accounting/supplier-aging');
  }

  globalSearch(query: string): Promise<any> {
    return this.api.get<any>(`/accounting/search?q=${encodeURIComponent(query)}`);
  }

  getJournalEntries(): Promise<JournalEntry[]> {
    return this.api.get<JournalEntry[]>('/accounting/journal-entries');
  }

  getLedger(accountId: string, fromDate = '', toDate = ''): Promise<any> {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    return this.api.get<any>(`/accounting/ledger/${accountId}${params.toString() ? `?${params}` : ''}`);
  }

  getTrialBalance(filters: {
    fromDate?: string;
    toDate?: string;
    displayMode?: string;
    accountType?: string;
    parentAccountId?: string;
    branch?: string;
    costCenterId?: string;
    currency?: string;
    accountStatus?: string;
    search?: string;
    showZeroBalances?: boolean;
    showParentAccounts?: boolean;
  } = {}): Promise<any> {
    const params = new URLSearchParams();
    if (filters.fromDate) params.set('fromDate', filters.fromDate);
    if (filters.toDate) params.set('toDate', filters.toDate);
    if (filters.displayMode) params.set('displayMode', filters.displayMode);
    if (filters.accountType) params.set('accountType', filters.accountType);
    if (filters.parentAccountId) params.set('parentAccountId', filters.parentAccountId);
    if (filters.branch) params.set('branch', filters.branch);
    if (filters.costCenterId) params.set('costCenterId', filters.costCenterId);
    if (filters.currency) params.set('currency', filters.currency);
    if (filters.accountStatus) params.set('accountStatus', filters.accountStatus);
    if (filters.search) params.set('search', filters.search);
    if (filters.showZeroBalances) params.set('showZeroBalances', 'true');
    if (filters.showParentAccounts) params.set('showParentAccounts', 'true');
    return this.api.get<any>(`/accounting/trial-balance${params.toString() ? `?${params}` : ''}`);
  }

  createJournalEntry(payload: {
    referenceNumber?: string;
    postingDate: string;
    description: string;
    status: 'draft' | 'posted';
    lines: Array<{ accountId: string; description?: string; debit?: number; credit?: number }>;
  }): Promise<JournalEntry> {
    return this.api.post<JournalEntry>('/accounting/journal-entries', payload);
  }

  updateJournalEntry(id: string, payload: {
    referenceNumber?: string;
    postingDate: string;
    description: string;
    status: 'draft' | 'posted';
    lines: Array<{ accountId: string; description?: string; debit?: number; credit?: number }>;
  }): Promise<JournalEntry> {
    return this.api.patch<JournalEntry>(`/accounting/journal-entries/${id}`, payload);
  }

  deleteJournalEntry(id: string): Promise<JournalEntry> {
    return this.api.delete<JournalEntry>(`/accounting/journal-entries/${id}`);
  }
}
