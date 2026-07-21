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
    pdf.setFillColor(32, 29, 93); pdf.triangle(0, 0, 210, 0, 210, 15, 'F'); pdf.triangle(0, 0, 0, 12, 120, 0, 'F');
    pdf.setFillColor(187, 47, 43); pdf.triangle(0, 0, 70, 0, 0, 10, 'F');
    pdf.setFillColor(32, 29, 93); pdf.triangle(0, 297, 210, 297, 0, 286, 'F');
    pdf.setFillColor(187, 47, 43); pdf.triangle(145, 297, 210, 289, 210, 297, 'F');
    try {
      const logoResponse = await fetch(detail.school.logoUrl);
      if (logoResponse.ok) {
        const bytes = new Uint8Array(await logoResponse.arrayBuffer());
        let binary = ''; bytes.forEach((byte) => binary += String.fromCharCode(byte));
        pdf.addImage(`data:${logoResponse.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`, 'PNG', rtl ? 168 : 15, 15, 26, 28);
      }
    } catch { /* The invoice remains valid if the optional logo cannot be loaded. */ }
    const headingX = rtl ? 160 : 50;
    pdf.setTextColor(32, 29, 93); pdf.setFontSize(15); pdf.text(tx(rtl ? detail.school.nameAr : detail.school.nameEn), headingX, 25, { align: rtl ? 'right' : 'left' });
    pdf.setTextColor(187, 47, 43); pdf.setFontSize(13); pdf.text(tx(this.i18n.t('invoice.tax_invoice')), headingX, 34, { align: rtl ? 'right' : 'left' });
    pdf.setTextColor(91, 96, 119); pdf.setFontSize(7); pdf.text(tx(rtl ? detail.school.addressAr : detail.school.addressEn), headingX, 40, { align: rtl ? 'right' : 'left' });
    pdf.setDrawColor(32, 29, 93); pdf.setLineWidth(.7); pdf.line(15, 48, 195, 48);
    line(this.i18n.t('invoice.number'), detail.invoice.invoiceNumber, 60);
    line(this.i18n.t('common.date'), this.date(detail.invoice.issuedAt), 68);
    line(this.i18n.t('common.status'), this.i18n.status(detail.invoice.status), 76);
    line(this.i18n.t('common.student'), rtl ? (detail.student.nameAr || detail.student.nameEn) : detail.student.nameEn, 88);
    line(this.i18n.t('customer.registration'), detail.student.registrationNumber, 96);
    line(this.i18n.t('customer.national_id'), detail.student.nationalId, 104);
    let y = 119;
    pdf.setFillColor(32, 29, 93); pdf.rect(15, y - 7, 180, 10, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(9);
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
    pdf.setFontSize(7); pdf.setTextColor(100, 105, 125); pdf.text(tx(rtl ? detail.school.addressAr : detail.school.addressEn), 105, 278, { align: 'center' });
    pdf.text(tx(this.i18n.t('invoice.generated_from_postgres')), 105, 283, { align: 'center' });
    pdf.save(`invoice-${detail.invoice.invoiceNumber}.pdf`);
  }

  private invoiceQr(detail: InvoiceDetail): Promise<string> {
    return QRCode.toDataURL(JSON.stringify({ invoiceId: detail.invoice.id, invoiceNumber: detail.invoice.invoiceNumber, parentPayable: detail.totals.parentPayable, vat: detail.totals.totalVat, governmentBorneVat: detail.totals.governmentBorneVat, taxTreatment: detail.totals.taxTreatment }), { margin: 1, width: 220 });
  }
}
