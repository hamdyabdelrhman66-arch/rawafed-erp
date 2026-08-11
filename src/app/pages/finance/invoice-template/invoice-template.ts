import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import QRCode from 'qrcode';
import { StorageService } from '../../../core/services/storage.service';
import { InvoicePdfService } from '../../../core/reports/invoice-pdf.service';

@Component({
  selector: 'app-invoice-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-template.html',
  styleUrls: ['./invoice-template.css', '../../../shared/finance/finance-ui.scss']
})
export class InvoiceTemplate implements OnChanges {
  @Input() invoice: any;
  @Input() qrData = '';
  qrImageDataUrl = '';

  isExporting = false;

  constructor(public readonly storage: StorageService, private readonly invoicePdf: InvoicePdfService) {}

  get schoolSettings() { return this.storage.settings(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['qrData']) void this.refreshQrImage();
  }

  async downloadPdf(): Promise<void> {
    this.isExporting = true;
    try {
      const settings = this.schoolSettings;
      await this.invoicePdf.download({
        invoiceNumber: this.invoice?.no || 'generated', status: this.statusLabel(this.invoice?.status),
        date: this.invoice?.date, studentName: this.invoice?.patient,
        registrationNumber: this.invoice?.patientId || this.invoice?.fileNo,
        category: this.invoice?.lines?.[0]?.category || this.invoice?.service,
        paymentMethod: this.paymentMethodLabel(this.invoice?.paymentMethod),
        schoolNameAr: settings.schoolNameAr, schoolNameEn: settings.schoolName,
        addressAr: settings.addressAr, addressEn: settings.addressEn,
        phone: settings.phone, email: settings.email, vatNumber: this.invoice?.taxNumber || settings.vatNumber,
        lines: (this.invoice?.lines || []).map((line: any) => ({
          description: line.service || this.invoice?.service || 'رسوم مدرسية', quantity: Number(this.invoice?.count || 1),
          unitPrice: Number(line.amount || 0), subtotal: Number(line.amount || 0) - Number(line.discount || 0),
          vat: Number(line.vat || 0), total: Number(line.total || 0),
        })),
        subtotal: Number(this.invoice?.amount || 0), discount: Number(this.invoice?.discount || 0),
        vat: Number(this.invoice?.vat || 0), total: Number(this.invoice?.total || 0),
        paid: Number(this.invoice?.paid || 0), remaining: Number(this.invoice?.remaining || 0), qrDataUrl: this.qrImageDataUrl,
      });
    } finally {
      this.isExporting = false;
    }
  }

  formatMoney(value: number): string {
    return this.roundMoney(value).toFixed(2);
  }

  hasVat(): boolean {
    return !this.invoice?.vatExempt && this.roundMoney(this.invoice?.vat) > 0;
  }

  statusLabel(value: string): string {
    const status = String(value || '').toLowerCase();
    if (status === 'paid') return 'مدفوعة · Paid';
    if (status === 'pending') return 'معلقة · Pending';
    if (status === 'partial' || status === 'partially_paid') return 'مدفوعة جزئيًا · Partially Paid';
    if (status === 'void') return 'ملغاة · Void';
    return value || '-';
  }

  paymentMethodLabel(value: string): string {
    const labels: Record<string, string> = {
      Cash: 'نقدي · Cash', Card: 'بطاقة · Card', 'Bank Transfer': 'تحويل بنكي · Bank Transfer',
      'Online Payment': 'دفع إلكتروني · Online Payment'
    };
    return labels[value] || value || '-';
  }

  private roundMoney(value: number): number {
    const numberValue = Number(value);
    const safeValue = Number.isFinite(numberValue) ? numberValue : 0;
    return Math.round((safeValue + Number.EPSILON) * 100) / 100;
  }

  private async refreshQrImage(): Promise<void> {
    this.qrImageDataUrl = this.qrData ? await QRCode.toDataURL(this.qrData, { margin: 1, width: 420 }) : '';
  }
}
