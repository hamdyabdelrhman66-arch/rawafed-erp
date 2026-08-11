import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './customers.html',
  styleUrls: ['./customers.css', '../../../shared/finance/finance-ui.scss']
})
export class Customers implements OnInit {
  customers: any[] = [];
  searchText = '';
  gradeFilter = '';
  balanceFilter = 'all';
  loading = true;
  modalOpen = false;
  saving = false;
  formError = '';
  readonly feeCategories = [
    { value: 'TUITION', en: 'Tuition', ar: 'رسوم تعليم' },
    { value: 'REGISTRATION', en: 'Registration', ar: 'رسوم تسجيل' },
    { value: 'BOOKS', en: 'Books', ar: 'كتب' },
    { value: 'UNIFORM', en: 'Uniform', ar: 'زي مدرسي' },
    { value: 'TRANSPORTATION', en: 'Transportation', ar: 'نقل' },
    { value: 'ACTIVITIES', en: 'Activities', ar: 'أنشطة' },
    { value: 'OTHER_SERVICES', en: 'Other services', ar: 'خدمات أخرى' },
  ];
  manualForm = this.emptyManualForm();

  constructor(
    private readonly accounting: AccountingService,
    public readonly i18n: I18nService,
    private readonly feedback: FeedbackService,
  ) {}

  async ngOnInit(): Promise<void> {
    try { await this.loadCustomers(); }
    finally { this.loading = false; }
  }

  private async loadCustomers(): Promise<void> {
    this.customers = await this.accounting.getCustomers();
  }

  private emptyManualForm(): any {
    return {
      customerType: 'CHILD', nameAr: '', nameEn: '', identityType: 'NATIONAL_ID', nationalId: '', nationality: 'سعودي',
      phone: '', email: '', grade: '', guardianName: '', guardianPhone: '', position: '', department: '', notes: '',
      fees: [{ name: 'Tuition', category: 'TUITION', amount: null }],
    };
  }

  openManualCustomer(): void {
    this.manualForm = this.emptyManualForm();
    this.formError = '';
    this.modalOpen = true;
  }

  closeManualCustomer(): void {
    if (this.saving) return;
    this.modalOpen = false;
  }

  addFee(): void {
    this.manualForm.fees.push({ name: '', category: 'OTHER_SERVICES', amount: null });
  }

  removeFee(index: number): void {
    if (this.manualForm.fees.length <= 1) return;
    this.manualForm.fees.splice(index, 1);
  }

  get manualFeesTotal(): number {
    return this.manualForm.fees.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  }

  get manualIdentityTaxHint(): string {
    const nationalId = String(this.manualForm.nationalId || '');
    if (nationalId.startsWith('1'))
      return this.l(
        'Saudi National ID: VAT on eligible education fees is not charged to the parent.',
        'هوية سعودية: لا تُضاف ضريبة الخدمات التعليمية المؤهلة إلى المبلغ المستحق على ولي الأمر.',
      );
    if (nationalId.startsWith('2'))
      return this.l(
        'Non-Saudi Iqama: VAT is calculated by the backend according to the fee category.',
        'إقامة غير سعودية: يحتسب النظام الضريبة من الـbackend وفق فئة المصروف.',
      );
    return this.l(
      'Enter the identity number to determine the approved VAT treatment.',
      'أدخل رقم الهوية لتحديد المعالجة الضريبية المعتمدة.',
    );
  }

  syncManualIdentity(value: unknown): void {
    const nationalId = String(value ?? '').replace(/\D/g, '').slice(0, 10);
    this.manualForm.nationalId = nationalId;
    if (nationalId.startsWith('1')) {
      this.manualForm.identityType = 'NATIONAL_ID';
      this.manualForm.nationality = 'سعودي';
    } else if (nationalId.startsWith('2')) {
      this.manualForm.identityType = 'IQAMA';
      if (['سعودي', 'سعودية', 'السعودية', 'Saudi', 'Saudi Arabia'].includes(String(this.manualForm.nationality || '').trim()))
        this.manualForm.nationality = 'غير سعودي';
    }
  }

  async saveManualCustomer(): Promise<void> {
    this.formError = '';
    if (!this.manualForm.nameAr.trim() || !this.manualForm.nameEn.trim() || !this.manualForm.phone.trim() || !/^\d{10}$/.test(this.manualForm.nationalId)) {
      this.formError = this.l('Complete the required identity and contact fields.', 'أكمل بيانات الاسم والهوية والجوال المطلوبة.');
      return;
    }
    if (this.manualForm.customerType === 'CHILD' && !this.manualForm.grade.trim()) {
      this.formError = this.l('Grade is required for a child.', 'يجب إدخال الصف للطفل.');
      return;
    }
    if (this.manualForm.customerType === 'WORKER' && !this.manualForm.position.trim()) {
      this.formError = this.l('Position is required for a worker.', 'يجب إدخال المسمى الوظيفي للعامل.');
      return;
    }
    if (!this.manualForm.fees.length || this.manualForm.fees.some((row: any) => !row.name.trim() || Number(row.amount || 0) <= 0)) {
      this.formError = this.l('Enter a valid name and amount for every fee item.', 'أدخل اسمًا ومبلغًا صحيحًا لكل بند مصروفات.');
      return;
    }
    this.saving = true;
    try {
      const customer = await this.accounting.createManualCustomer(this.manualForm);
      await this.loadCustomers();
      this.searchText = customer.registrationNumber;
      this.modalOpen = false;
      this.feedback.success(this.l('Customer and financial account created successfully.', 'تم إنشاء العميل وحسابه المالي بنجاح.'));
    } catch (error) {
      this.formError = safeErrorMessage(error);
      this.feedback.error(this.l('Customer could not be created.', 'تعذر إنشاء العميل.'), this.formError);
    } finally {
      this.saving = false;
    }
  }

  get filteredCustomers(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.customers.filter((customer) =>
      (!query ||
      [customer.customerCode, customer.nameAr, customer.nameEn, customer.registrationNumber, customer.phone, customer.email, customer.nationalId]
        .join(' ')
        .toLowerCase()
        .includes(query)) &&
      (!this.gradeFilter || customer.grade === this.gradeFilter) &&
      (this.balanceFilter === 'all' || (this.balanceFilter === 'outstanding' ? Number(customer.summary?.outstanding || 0) > 0 : Number(customer.summary?.outstanding || 0) <= 0))
    );
  }

  get grades(): string[] { return [...new Set(this.customers.map(row => row.grade).filter(Boolean))].sort() as string[]; }
  resetFilters(): void { this.searchText = ''; this.gradeFilter = ''; this.balanceFilter = 'all'; }
  l(en: string, ar: string): string { return this.i18n.label(en, ar); }

  get totals(): any {
    return this.customers.reduce((sum, customer) => ({
      outstanding: sum.outstanding + Number(customer.summary?.outstanding || 0),
      credit: sum.credit + Number(customer.summary?.credit || 0),
      invoices: sum.invoices + Number(customer.summary?.invoiceTotal || 0),
      payments: sum.payments + Number(customer.summary?.paymentTotal || 0)
    }), { outstanding: 0, credit: 0, invoices: 0, payments: 0 });
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }
}
