import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { AuthService } from '../../../core/auth/auth.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { InvoicePdfService } from '../../../core/reports/invoice-pdf.service';
import { StorageService } from '../../../core/services/storage.service';

interface GenerateInvoiceForm {
  invoiceNumber: string;
  patientName: string;
  doctorName: string;
  fileNumber: string;
  patientId: string;
  clinic: string;
  insuranceCompany: string;
  serviceName: string;
  amountBeforeVat: number | null;
  discount: number | null;
  date: string;
  paymentMethod: string;
  paidAmount: number | null;
  taxNumber: string;
  notes: string;
}

@Component({
  selector: 'app-generate-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './generate-invoice.html',
  styleUrls: ['./generate-invoice.css', '../../../shared/finance/finance-ui.scss']
})
export class GenerateInvoice implements OnInit {
  readonly englishSellerName = 'RAWAFED INTERNATIONAL SCHOOL';
  readonly paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Online Payment'];
  readonly billingEntities = ['Parent / Student', 'Company Sponsor', 'Scholarship', 'School'];
  readonly schoolOptions = ['Rawafed International School', 'Rawafed Middle East International'];

  previewVisible = false;
  isExporting = false;
  qrImageDataUrl = '';
  accounts: any[] = [];
  selectedAccountId: number | null = null;
  selectedFeeItem = '';

  form: GenerateInvoiceForm = {
    invoiceNumber: '',
    patientName: '',
    doctorName: '',
    fileNumber: '',
    patientId: '',
    clinic: '',
    insuranceCompany: '',
    serviceName: '',
    amountBeforeVat: null,
    discount: null,
    date: '',
    paymentMethod: '',
    paidAmount: null,
    taxNumber: '',
    notes: '',
  };

  constructor(
    private readonly accountService: PatientPackagesService,
    private readonly auth: AuthService,
    private readonly zatcaInvoice: ZatcaInvoiceService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly storage: StorageService,
    public readonly i18n: I18nService
  ) {}

  l(en: string, ar: string): string { return this.i18n.label(en, ar); }

  currency(): string { return this.l('SAR', 'ريال'); }

  paymentMethodLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      Cash: ['Cash', 'نقدي'], Card: ['Card', 'بطاقة'], 'Bank Transfer': ['Bank Transfer', 'تحويل بنكي'],
      'Online Payment': ['Online Payment', 'دفع إلكتروني']
    };
    const label = labels[value];
    return label ? this.l(label[0], label[1]) : value;
  }

  billingEntityLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      'Parent / Student': ['Parent / Student', 'ولي الأمر / الطالب'], 'Company Sponsor': ['Company Sponsor', 'الشركة الراعية'],
      Scholarship: ['Scholarship', 'منحة دراسية'], School: ['School', 'المدرسة']
    };
    const label = labels[value];
    return label ? this.l(label[0], label[1]) : value;
  }

  feeItemLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      'School Fees': ['School Fees', 'الرسوم الدراسية'], Tuition: ['Tuition', 'رسوم التعليم'],
      'Registration Fee': ['Registration Fee', 'رسوم التسجيل'], Uniform: ['Uniform', 'الزي المدرسي'],
      'Bus Transportation': ['Bus Transportation', 'النقل المدرسي'], Books: ['Books', 'الكتب'], Activities: ['Activities', 'الأنشطة']
    };
    const label = labels[value];
    return label ? this.l(label[0], label[1]) : value;
  }

  schoolLabel(value: string): string {
    const labels: Record<string, string> = {
      'Rawafed International School': 'مدارس روافد العالمية',
      'Rawafed Middle East International': 'مدارس روافد الشرق الأوسط العالمية'
    };
    return this.i18n.language() === 'ar' ? (labels[value] || value) : value;
  }

  ngOnInit(): void {
    this.form.invoiceNumber = `INV-${Date.now()}`;
    this.form.date = new Date().toISOString().slice(0, 10);
    this.form.doctorName = this.auth.session()?.displayName || '';
    this.form.clinic = this.schoolOptions[0];
    this.form.insuranceCompany = this.billingEntities[0];
    this.form.paymentMethod = this.paymentMethods[0];
    this.form.taxNumber = this.zatcaInvoice.taxNumber;

    this.accountService.getPackages().subscribe((accounts: any[]) => {
      this.accounts = accounts;
    });
  }

  get selectedAccount(): any | null {
    return this.accounts.find((account) => account.id === Number(this.selectedAccountId)) || null;
  }

  get selectedAccountFeeItems(): any[] {
    return (this.selectedAccount?.services || []).filter((item: any) => String(item.service).toUpperCase() !== 'VAT');
  }

  get vatRate(): number { return this.selectedAccount?.vatExempt ? 0 : 0.15; }

  get subtotal(): number {
    return this.toNumber(this.form.amountBeforeVat);
  }

  get discount(): number {
    return this.toNumber(this.form.discount);
  }

  get taxableAmount(): number {
    return Math.max(this.subtotal - this.discount, 0);
  }

  get vatAmount(): number {
    return this.roundMoney(this.taxableAmount * this.vatRate);
  }

  get totalAmount(): number {
    return this.roundMoney(this.taxableAmount + this.vatAmount);
  }

  get paidAmount(): number {
    return this.toNumber(this.form.paidAmount);
  }

  get remainingAmount(): number {
    return this.roundMoney(Math.max(this.totalAmount - this.paidAmount, 0));
  }

  get invoiceDateTime(): string {
    const date = this.form.date || new Date().toISOString().slice(0, 10);
    return `${date}T00:00:00Z`;
  }

  get qrData(): string {
    return this.zatcaInvoice.qrData({
      sellerName: this.zatcaInvoice.sellerName,
      taxNumber: this.form.taxNumber || this.zatcaInvoice.taxNumber,
      date: this.invoiceDateTime,
      total: this.totalAmount,
      vat: this.vatAmount
    });
  }

  onAccountChange(): void {
    const account = this.selectedAccount;
    if (!account) return;

    this.form.patientName = account.patient || '';
    this.form.fileNumber = account.registrationNumber || String(account.id || '');
    this.form.patientId = account.nationalId || '';
    this.form.paidAmount = Number(account.paid || 0);
    this.selectedFeeItem = this.selectedAccountFeeItems[0]?.service || 'School Fees';
    this.onFeeItemChange();
  }

  onFeeItemChange(): void {
    const feeItem = this.selectedAccountFeeItems.find((item) => item.service === this.selectedFeeItem);
    this.form.serviceName = this.selectedFeeItem;

    if (feeItem) {
      this.form.amountBeforeVat = Number(feeItem.price || 0) * Number(feeItem.sessions || 1);
      return;
    }

    this.form.amountBeforeVat = Number(this.selectedAccount?.subtotal || this.selectedAccount?.total || 0);
  }

  async showInvoice(): Promise<void> {
    this.qrImageDataUrl = await QRCode.toDataURL(this.qrData, { margin: 1, width: 133 });
    this.previewVisible = true;
  }

  async downloadPdf(): Promise<void> {
    this.isExporting = true;
    try {
      const settings = this.storage.settings();
      await this.invoicePdf.download({
        invoiceNumber: this.form.invoiceNumber || 'generated', date: this.form.date,
        studentName: this.form.patientName, registrationNumber: this.form.fileNumber || this.form.patientId,
        category: this.form.serviceName, paymentMethod: this.paymentMethodLabel(this.form.paymentMethod),
        schoolNameAr: settings.schoolNameAr, schoolNameEn: settings.schoolName,
        addressAr: settings.addressAr, addressEn: settings.addressEn, phone: settings.phone,
        email: settings.email, vatNumber: this.form.taxNumber || settings.vatNumber, qrDataUrl: this.qrImageDataUrl,
        lines: [{ description: this.form.serviceName || this.l('School Fees', 'رسوم مدرسية'), quantity: 1,
          unitPrice: this.subtotal, subtotal: this.taxableAmount, vat: this.vatAmount, total: this.totalAmount }],
        subtotal: this.subtotal, discount: this.discount, vat: this.vatAmount, total: this.totalAmount,
        paid: this.paidAmount, remaining: this.remainingAmount,
      });
    } finally {
      this.isExporting = false;
    }
  }

  formatMoney(value: number): string {
    return this.roundMoney(value).toLocaleString(this.i18n.language() === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private toNumber(value: number | null): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

}
