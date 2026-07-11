import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { ExpensesService } from '../../../core/finance/expenses.service';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './suppliers.html',
  styleUrls: ['./suppliers.css', '../../../shared/finance/finance-ui.scss']
})
export class Suppliers implements OnInit {
  suppliers: any[] = [];
  expenses: any[] = [];
  payableAccounts: any[] = [];
  searchText = '';
  editingId = '';
  statementSupplierId = '';
  form = this.emptySupplier();

  constructor(
    private readonly accounting: AccountingService,
    private readonly expensesService: ExpensesService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  get filteredSuppliers(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.suppliers.filter((supplier) =>
      !query ||
      [supplier.supplierCode, supplier.nameAr, supplier.nameEn, supplier.vatNumber, supplier.phone, supplier.email]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  get statementRows(): any[] {
    return this.expenses.filter((expense) => expense.supplierId === this.statementSupplierId);
  }

  async load(): Promise<void> {
    [this.suppliers, this.payableAccounts] = await Promise.all([
      this.accounting.getSuppliers(),
      this.accounting.getPayableAccounts()
    ]);
    this.expensesService.getExpenses().subscribe((items) => this.expenses = items);
  }

  edit(supplier: any): void {
    this.editingId = supplier.id;
    this.form = { ...supplier, name: supplier.nameEn };
  }

  async save(): Promise<void> {
    const payload = {
      name: this.form.name || this.form.nameEn,
      nameAr: this.form.nameAr,
      nameEn: this.form.nameEn || this.form.name,
      vatNumber: this.form.vatNumber,
      commercialRegistration: this.form.commercialRegistration,
      phone: this.form.phone,
      email: this.form.email,
      address: this.form.address,
      city: this.form.city,
      contactPerson: this.form.contactPerson,
      paymentTerms: this.form.paymentTerms,
      openingBalance: this.form.openingBalance,
      payableAccountId: this.form.payableAccountId,
      status: this.form.status,
      notes: this.form.notes
    };
    if (this.editingId) await this.accounting.updateSupplier(this.editingId, payload);
    else await this.accounting.createSupplier(payload);
    this.cancel();
    await this.load();
  }

  async deactivate(id: string): Promise<void> {
    await this.accounting.deactivateSupplier(id);
    await this.load();
  }

  cancel(): void {
    this.editingId = '';
    this.form = this.emptySupplier();
  }

  showStatement(id: string): void {
    this.statementSupplierId = id;
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }

  private emptySupplier(): any {
    return {
      name: '',
      nameAr: '',
      nameEn: '',
      vatNumber: '',
      commercialRegistration: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      contactPerson: '',
      paymentTerms: '',
      openingBalance: 0,
      payableAccountId: '',
      status: 'active',
      notes: ''
    };
  }
}
