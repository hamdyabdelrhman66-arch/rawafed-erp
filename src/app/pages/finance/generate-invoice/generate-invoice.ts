import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { AuthService } from '../../../core/auth/auth.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { I18nService } from '../../../core/i18n/i18n.service';

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
  @ViewChild('invoiceSheet') invoiceSheet?: ElementRef<HTMLElement>;

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
    if (!this.invoiceSheet) return;

    this.isExporting = true;

    try {
      await this.waitForImages(this.invoiceSheet.nativeElement);

      const canvas = await html2canvas(this.invoiceSheet.nativeElement, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: this.invoiceSheet.nativeElement.scrollWidth,
        windowHeight: this.invoiceSheet.nativeElement.scrollHeight,
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageData = canvas.toDataURL('image/png', 1);

      pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save(`invoice-${this.form.invoiceNumber || 'generated'}.pdf`);
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

  private async waitForImages(element: HTMLElement): Promise<void> {
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map((image) => {
        if (image.complete) return Promise.resolve();

        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }),
    );
  }
}
