import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';
import { ExpensesService } from '../../../core/finance/expenses.service';
import { AccountNamePipe } from '../../../core/i18n/account-name.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { StatusLabelPipe } from '../../../core/i18n/status-label.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { UploadedDocument } from '../../../core/models/admission.models';
import { AdmissionService } from '../../../core/services/admission.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';

@Component({
  selector: 'app-add-expense',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, StatusLabelPipe, AccountNamePipe],
  templateUrl: './add-expense.html',
  styleUrls: ['./add-expense.css', '../../../shared/finance/finance-ui.scss']
})
export class AddExpense implements OnInit {
  suppliers: any[] = [];
  expenseAccounts: AccountingAccount[] = [];
  paymentAccounts: AccountingAccount[] = [];
  costCenters: any[] = [];
  invoiceTypes = ['Tax Invoice', 'Non Tax Invoice', 'Simplified Tax Invoice', 'Receipt Only', 'No Invoice'];
  paymentStatuses = ['Paid', 'Unpaid', 'Partially Paid'];
  paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'Online'];

  supplierSearch = '';
  showSupplierModal = false;
  saving = false;
  invoiceDocument?: UploadedDocument;

  expense = {
    expenseDate: new Date().toISOString().slice(0, 10),
    supplierId: '',
    expenseAccountId: '',
    invoiceType: 'Tax Invoice',
    supplierVatNumber: '',
    supplierInvoiceNumber: '',
    description: '',
    costCenterId: '',
    amountBeforeVat: 0,
    vatRate: 15,
    vatAmount: 0,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    paymentFromAccountId: '',
    paidAmount: 0,
    notes: ''
  };

  newSupplier = {
    name: '',
    vatNumber: '',
    commercialRegistration: '',
    phone: '',
    email: '',
    address: '',
    contactPerson: '',
    openingBalance: 0
  };

  constructor(
    private readonly router: Router,
    private readonly expensesService: ExpensesService,
    private readonly accounting: AccountingService,
    private readonly admission: AdmissionService,
    private readonly i18n: I18nService,
    private readonly feedback: FeedbackService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadMasterData();
  }

  get filteredSuppliers(): any[] {
    const query = this.supplierSearch.trim().toLowerCase();
    return this.suppliers.filter((supplier) =>
      !query ||
      [supplier.supplierCode, supplier.nameAr, supplier.nameEn, supplier.vatNumber, supplier.phone]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  get totalAmount(): number {
    return this.roundMoney(Number(this.expense.amountBeforeVat || 0) + Number(this.expense.vatAmount || 0));
  }

  get selectedSupplier(): any {
    return this.suppliers.find((supplier) => supplier.id === this.expense.supplierId);
  }

  get selectedExpenseAccount(): AccountingAccount | undefined {
    return this.expenseAccounts.find((account) => account.id === this.expense.expenseAccountId);
  }

  async loadMasterData(): Promise<void> {
    const [suppliers, expenseAccounts, paymentAccounts, costCenters] = await Promise.all([
      this.accounting.getSuppliers(),
      this.accounting.getExpenseAccounts(),
      this.accounting.getPaymentAccounts(),
      this.accounting.getCostCenters()
    ]);
    this.suppliers = suppliers;
    this.expenseAccounts = expenseAccounts;
    this.paymentAccounts = paymentAccounts;
    this.costCenters = costCenters;
    this.expense.expenseAccountId ||= expenseAccounts[0]?.id || '';
    this.expense.paymentFromAccountId ||= paymentAccounts[0]?.id || '';
  }

  selectSupplier(supplierId: string): void {
    this.expense.supplierId = supplierId;
    const supplier = this.selectedSupplier;
    this.expense.supplierVatNumber = supplier?.vatNumber || '';
  }

  onInvoiceTypeChange(): void {
    if (!['Tax Invoice', 'Simplified Tax Invoice'].includes(this.expense.invoiceType)) {
      this.expense.vatRate = 0;
      this.expense.vatAmount = 0;
      return;
    }
    this.expense.vatRate ||= 15;
    this.recalculateVat();
  }

  recalculateVat(): void {
    if (!['Tax Invoice', 'Simplified Tax Invoice'].includes(this.expense.invoiceType)) {
      this.expense.vatAmount = 0;
      return;
    }
    this.expense.vatAmount = this.roundMoney(Number(this.expense.amountBeforeVat || 0) * Number(this.expense.vatRate || 0) / 100);
    if (this.expense.paymentStatus === 'Paid') this.expense.paidAmount = this.totalAmount;
  }

  onPaymentStatusChange(): void {
    if (this.expense.paymentStatus === 'Paid') this.expense.paidAmount = this.totalAmount;
    if (this.expense.paymentStatus === 'Unpaid') this.expense.paidAmount = 0;
  }

  async onInvoiceSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.invoiceDocument = await this.admission.fileToDocument(file, 'Purchase Invoice');
      this.feedback.success(`${file.name} uploaded successfully.`);
    } catch (error) {
      this.feedback.error('Upload failed.', safeErrorMessage(error));
    }
  }

  clearInvoiceDocument(): void {
    this.invoiceDocument = undefined;
    const input = document.getElementById('expense-invoice-upload') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async saveSupplier(): Promise<void> {
    if (!this.newSupplier.name.trim()) {
      this.feedback.validation('Supplier name is required.');
      return;
    }
    try {
      const supplier = await this.accounting.createSupplier({
        name: this.newSupplier.name.trim(),
        vatNumber: this.newSupplier.vatNumber,
        commercialRegistration: this.newSupplier.commercialRegistration,
        phone: this.newSupplier.phone,
        email: this.newSupplier.email,
        address: this.newSupplier.address,
        contactPerson: this.newSupplier.contactPerson,
        openingBalance: this.newSupplier.openingBalance
      });
      await this.loadMasterData();
      this.selectSupplier(supplier.id);
      this.supplierSearch = supplier.nameEn;
      this.showSupplierModal = false;
      this.newSupplier = { name: '', vatNumber: '', commercialRegistration: '', phone: '', email: '', address: '', contactPerson: '', openingBalance: 0 };
      this.feedback.success(`Supplier ${supplier.nameEn || supplier.nameAr || this.supplierSearch} created successfully.`);
    } catch (error) {
      this.feedback.error('Supplier could not be created.', safeErrorMessage(error));
    }
  }

  async saveExpense(): Promise<void> {
    if (this.saving) return;
    if (!this.expense.expenseAccountId || !this.expense.description.trim() || this.totalAmount <= 0) {
      this.feedback.validation('Expense account, description, and amount are required.');
      return;
    }
    this.saving = true;
    try {
      await this.expensesService.addExpense({
        expenseDate: this.expense.expenseDate,
        supplierId: this.expense.supplierId,
        expenseAccountId: this.expense.expenseAccountId,
        invoiceType: this.expense.invoiceType,
        supplierInvoiceNumber: this.expense.supplierInvoiceNumber,
        description: this.expense.description,
        costCenterId: this.expense.costCenterId,
        amountBeforeVat: this.expense.amountBeforeVat,
        vatRate: this.expense.vatRate,
        vatAmount: this.expense.vatAmount,
        totalAmount: this.totalAmount,
        paymentStatus: this.expense.paymentStatus,
        paymentMethod: this.expense.paymentMethod,
        paymentFromAccountId: this.expense.paymentFromAccountId,
        paidAmount: this.expense.paidAmount,
        attachmentUploadId: this.invoiceDocument?.backendId || this.invoiceDocument?.id,
        attachmentFileName: this.invoiceDocument?.fileName,
        attachmentUrl: this.invoiceDocument?.uploadUrl,
        notes: this.expense.notes
      }).toPromise();
      this.feedback.success('Expense saved and accounting journal created successfully.');
      this.router.navigate(['/finance/expenses']);
    } catch (error) {
      this.feedback.error(this.i18n.t('expense.save_error'), safeErrorMessage(error));
      this.saving = false;
    }
  }

  private roundMoney(value: number): number {
    return Math.round(Number(value || 0) * 100) / 100;
  }
}
