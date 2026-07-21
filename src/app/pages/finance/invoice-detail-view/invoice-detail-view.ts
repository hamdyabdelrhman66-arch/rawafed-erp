import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { AccountingService, InvoiceDetail } from '../../../core/finance/accounting.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-invoice-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './invoice-detail-view.html',
  styleUrls: ['./invoice-detail-view.css', '../../../shared/finance/finance-ui.scss'],
})
export class InvoiceDetailView implements OnInit {
  detail?: InvoiceDetail;
  loading = true;
  error = '';
  busy = false;
  qrImage = '';
  readonly detailLabels: Record<string, { en: string; ar: string }> = {
    grade: { en: 'Grade', ar: 'الصف' }, className: { en: 'Class', ar: 'الفصل' },
    route: { en: 'Route', ar: 'المسار' }, area: { en: 'Area', ar: 'المنطقة' },
    size: { en: 'Size', ar: 'المقاس' }, item: { en: 'Item', ar: 'الصنف' },
    activity: { en: 'Activity', ar: 'النشاط' }, servicePeriod: { en: 'Service period', ar: 'فترة الخدمة' },
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly accounting: AccountingService,
    private readonly feedback: FeedbackService,
    public readonly i18n: I18nService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.detail = await this.accounting.getInvoiceDetails(this.invoiceId);
      this.qrImage = await this.invoiceQr(this.detail);
      if (this.route.snapshot.queryParamMap.get('print') === '1') await this.print();
      else if (this.route.snapshot.queryParamMap.get('pdf') === '1') await this.downloadPdf();
    } catch (error) {
      this.error = safeErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  get invoiceId(): string { return String(this.route.snapshot.paramMap.get('invoiceId') || ''); }
  get categoryEntries(): Array<[string, unknown]> { return Object.entries(this.detail?.categoryDetails || {}); }
  label(key: string): string { const value = this.detailLabels[key]; return value ? this.i18n.label(value.en, value.ar) : key; }
  money(value: unknown): string { return this.i18n.money(Number(value || 0), this.detail?.totals.currency || 'SAR'); }
  date(value: string | null | undefined): string { return value ? new Intl.DateTimeFormat(this.i18n.language() === 'ar' ? 'ar-SA' : 'en-GB').format(new Date(value)) : '-'; }

  async print(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.detail = await this.accounting.authorizeInvoicePrint(this.invoiceId);
      setTimeout(() => window.print(), 50);
    } catch (error) {
      this.feedback.error(this.i18n.t('invoice.print_failed'), safeErrorMessage(error));
    } finally { this.busy = false; }
  }

  async downloadPdf(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.detail = await this.accounting.authorizeInvoicePdf(this.invoiceId);
      await this.createVectorPdf(this.detail);
    } catch (error) {
      this.feedback.error(this.i18n.t('invoice.pdf_failed'), safeErrorMessage(error));
    } finally { this.busy = false; }
  }

  private async createVectorPdf(detail: InvoiceDetail): Promise<void> {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const fontResponse = await fetch('/fonts/Cairo.ttf');
    if (fontResponse.ok) {
      const bytes = new Uint8Array(await fontResponse.arrayBuffer());
      let binary = '';
      bytes.forEach((byte) => binary += String.fromCharCode(byte));
      pdf.addFileToVFS('Cairo.ttf', btoa(binary));
      pdf.addFont('Cairo.ttf', 'Cairo', 'normal');
      pdf.setFont('Cairo');
    }
    const rtl = this.i18n.language() === 'ar';
    const tx = (value: unknown) => {
      const text = String(value ?? '-');
      return rtl && (pdf as any).processArabic ? (pdf as any).processArabic(text) : text;
    };
    const right = 195;
    const line = (label: string, value: unknown, y: number) => {
      pdf.setFontSize(9); pdf.setTextColor(91, 107, 129); pdf.text(tx(label), rtl ? right : 15, y, { align: rtl ? 'right' : 'left' });
      pdf.setFontSize(10); pdf.setTextColor(15, 23, 42); pdf.text(tx(value), rtl ? 120 : 80, y, { align: rtl ? 'right' : 'left' });
    };
    pdf.setFillColor(9, 54, 111); pdf.rect(0, 0, 210, 34, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(18); pdf.text(tx(this.i18n.t('invoice.tax_invoice')), rtl ? right : 15, 15, { align: rtl ? 'right' : 'left' });
    pdf.setFontSize(11); pdf.text(tx(rtl ? detail.school.nameAr : detail.school.nameEn), rtl ? right : 15, 25, { align: rtl ? 'right' : 'left' });
    pdf.setFontSize(8); pdf.text(tx(rtl ? detail.school.addressAr : detail.school.addressEn), rtl ? right : 15, 31, { align: rtl ? 'right' : 'left' });
    line(this.i18n.t('invoice.number'), detail.invoice.invoiceNumber, 46);
    line(this.i18n.t('common.date'), this.date(detail.invoice.issuedAt), 54);
    line(this.i18n.t('common.status'), this.i18n.status(detail.invoice.status), 62);
    line(this.i18n.t('common.student'), rtl ? (detail.student.nameAr || detail.student.nameEn) : detail.student.nameEn, 74);
    line(this.i18n.t('customer.registration'), detail.student.registrationNumber, 82);
    line(this.i18n.t('customer.national_id'), detail.student.nationalId, 90);
    let y = 105;
    pdf.setFillColor(234, 242, 255); pdf.rect(15, y - 7, 180, 10, 'F');
    pdf.setTextColor(7, 51, 107); pdf.setFontSize(9);
    const headers = [this.i18n.t('common.item'), this.i18n.t('common.amount'), this.i18n.t('invoice.vat'), this.i18n.t('common.total')];
    [18, 105, 138, 170].forEach((x, index) => pdf.text(tx(headers[index]), x, y));
    y += 10;
    for (const row of detail.lines) {
      pdf.setTextColor(15, 23, 42); pdf.text(tx(row.description), 18, y);
      pdf.text(row.netAmount.toFixed(2), 105, y); pdf.text((row.vatAmount + row.governmentBorneVat).toFixed(2), 138, y); pdf.text(row.totalAmount.toFixed(2), 170, y);
      pdf.setDrawColor(226, 232, 240); pdf.line(15, y + 3, 195, y + 3); y += 9;
    }
    y += 5;
    const totals: Array<[string, number]> = [
      [this.i18n.t('invoice.subtotal'), detail.totals.subtotal], [this.i18n.t('invoice.discount'), detail.totals.discount],
      [this.i18n.t('invoice.vat'), detail.totals.totalVat],
      [this.i18n.t('invoice.government_borne_vat'), detail.totals.governmentBorneVat],
      [this.i18n.t('invoice.parent_payable'), detail.totals.parentPayable],
      [this.i18n.t('customer.amount_paid'), detail.totals.paid], [this.i18n.t('customer.remaining'), detail.totals.remaining],
    ];
    totals.forEach(([label, value]) => { pdf.text(tx(label), 125, y); pdf.text(`${value.toFixed(2)} ${detail.totals.currency}`, 190, y, { align: 'right' }); y += 8; });
    const qr = await this.invoiceQr(detail);
    pdf.addImage(qr, 'PNG', 15, Math.min(y - 20, 245), 32, 32);
    pdf.setFontSize(8); pdf.setTextColor(100, 116, 139); pdf.text(tx(this.i18n.t('invoice.generated_from_postgres')), 105, 286, { align: 'center' });
    pdf.save(`invoice-${detail.invoice.invoiceNumber}.pdf`);
  }

  private invoiceQr(detail: InvoiceDetail): Promise<string> {
    return QRCode.toDataURL(JSON.stringify({ invoiceId: detail.invoice.id, invoiceNumber: detail.invoice.invoiceNumber, parentPayable: detail.totals.parentPayable, vat: detail.totals.totalVat, governmentBorneVat: detail.totals.governmentBorneVat, taxTreatment: detail.totals.taxTreatment }), { margin: 1, width: 220 });
  }
}
