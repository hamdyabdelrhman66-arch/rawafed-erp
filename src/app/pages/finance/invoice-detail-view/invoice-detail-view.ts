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
    const navy = [32, 29, 93] as const;
    const red = [187, 47, 43] as const;
    const muted = [96, 103, 122] as const;
    const money = (value: number) => `${Number(value || 0).toFixed(2)} ${detail.totals.currency}`;
    const infoCell = (x: number, y: number, width: number, label: string, value: unknown) => {
      pdf.setDrawColor(215, 222, 234); pdf.rect(x, y, width, 16);
      pdf.setFontSize(6.5); pdf.setTextColor(...muted); pdf.text(tx(label), rtl ? x + width - 4 : x + 4, y + 5, { align: rtl ? 'right' : 'left' });
      pdf.setFontSize(8.5); pdf.setTextColor(22, 22, 47); pdf.text(tx(value), rtl ? x + width - 4 : x + 4, y + 12, { align: rtl ? 'right' : 'left', maxWidth: width - 8 });
    };
    pdf.setFillColor(...navy); pdf.triangle(0, 0, 210, 0, 0, 15, 'F');
    pdf.setFillColor(...red); pdf.triangle(120, 0, 210, 0, 210, 9, 'F');
    pdf.setFillColor(...navy); pdf.triangle(0, 297, 210, 297, 0, 289, 'F');
    pdf.setFillColor(...red); pdf.triangle(0, 297, 72, 297, 0, 292, 'F');
    try {
      const logoResponse = await fetch(detail.school.logoUrl);
      if (logoResponse.ok) {
        const bytes = new Uint8Array(await logoResponse.arrayBuffer());
        let binary = ''; bytes.forEach((byte) => binary += String.fromCharCode(byte));
        pdf.addImage(`data:${logoResponse.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`, 'PNG', rtl ? 166 : 16, 16, 27, 29);
      }
    } catch { /* The invoice remains valid if the optional logo cannot be loaded. */ }
    pdf.setTextColor(...red); pdf.setFontSize(11); pdf.text(tx(this.i18n.t('invoice.tax_invoice')), rtl ? 16 : 194, 25, { align: rtl ? 'left' : 'right' });
    pdf.setTextColor(...navy); pdf.setFontSize(10); pdf.text(tx(detail.invoice.invoiceNumber), rtl ? 16 : 194, 33, { align: rtl ? 'left' : 'right', maxWidth: 43 });
    pdf.setFontSize(7.5); pdf.text(tx(this.i18n.status(detail.invoice.status)), rtl ? 16 : 194, 40, { align: rtl ? 'left' : 'right' });
    pdf.setTextColor(...navy); pdf.setFontSize(15); pdf.text(tx(rtl ? detail.school.nameAr : detail.school.nameEn), 105, 26, { align: 'center', maxWidth: 98 });
    pdf.setTextColor(...muted); pdf.setFontSize(6.5); pdf.text(tx(rtl ? detail.school.addressAr : detail.school.addressEn), 105, 33, { align: 'center', maxWidth: 95 });
    pdf.text(`${detail.school.phone || ''}${detail.school.phone && detail.school.email ? '  |  ' : ''}${detail.school.email || ''}`, 105, 39, { align: 'center', maxWidth: 95 });
    if (detail.school.vatNumber) pdf.text(`${tx(this.i18n.t('invoice.vat_number'))}: ${detail.school.vatNumber}`, 105, 44, { align: 'center' });
    pdf.setDrawColor(...navy); pdf.setLineWidth(.6); pdf.line(15, 51, 195, 51);

    infoCell(15, 58, 60, this.i18n.t('common.date'), this.date(detail.invoice.issuedAt));
    infoCell(75, 58, 60, this.i18n.t('invoice.due_date'), this.date(detail.invoice.dueAt));
    infoCell(135, 58, 60, this.i18n.t('invoice.category'), detail.invoice.categoryLabel);
    const studentName = rtl ? (detail.student.nameAr || detail.student.nameEn) : detail.student.nameEn;
    infoCell(15, 74, 60, this.i18n.t('common.student'), studentName);
    infoCell(75, 74, 60, this.i18n.t('customer.registration'), detail.student.registrationNumber || '-');
    infoCell(135, 74, 60, this.i18n.t('customer.grade'), detail.student.grade || '-');
    infoCell(15, 90, 60, this.i18n.t('customer.national_id'), detail.student.nationalId || '-');
    infoCell(75, 90, 60, this.i18n.t('customer.guardian'), detail.student.guardianName || '-');
    infoCell(135, 90, 60, this.i18n.t('common.phone'), detail.student.guardianPhone || '-');

    let y = 115;
    const columns = rtl ? [195, 123, 103, 76, 48, 15] : [15, 87, 107, 134, 162, 195];
    const alignments: Array<'left' | 'right' | 'center'> = rtl ? ['right', 'right', 'right', 'right', 'right', 'left'] : ['left', 'left', 'left', 'left', 'left', 'right'];
    const headers = [this.i18n.t('common.description'), this.i18n.t('invoice.quantity'), this.i18n.t('invoice.unit_price'), this.i18n.t('invoice.subtotal'), this.i18n.t('invoice.vat'), this.i18n.t('common.total')];
    pdf.setFillColor(...navy); pdf.rect(15, y - 7, 180, 10, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(7);
    headers.forEach((header, index) => pdf.text(tx(header), columns[index], y, { align: alignments[index] }));
    y += 10;
    for (const row of detail.lines) {
      pdf.setTextColor(15, 23, 42); pdf.setFontSize(detail.lines.length > 7 ? 6.3 : 7.2);
      const values = [tx(row.description), String(row.quantity), row.unitPrice.toFixed(2), row.netAmount.toFixed(2), (row.vatAmount + row.governmentBorneVat).toFixed(2), row.totalAmount.toFixed(2)];
      values.forEach((value, index) => pdf.text(value, columns[index], y, { align: alignments[index], maxWidth: index === 0 ? 67 : 27 }));
      pdf.setDrawColor(226, 232, 240); pdf.line(15, y + 3, 195, y + 3); y += detail.lines.length > 7 ? 7 : 9;
    }
    const summaryY = Math.max(164, y + 8);
    const qr = await this.invoiceQr(detail);
    pdf.setDrawColor(223, 189, 104); pdf.roundedRect(15, summaryY, 58, 58, 2, 2);
    pdf.addImage(qr, 'PNG', 20, summaryY + 5, 48, 48);
    const totals: Array<[string, number, 'normal' | 'grand' | 'remaining']> = [
      [this.i18n.t('invoice.subtotal'), detail.totals.subtotal, 'normal'],
      ...(detail.totals.discount ? [[this.i18n.t('invoice.discount'), -detail.totals.discount, 'normal'] as [string, number, 'normal']] : []),
      [`${this.i18n.t('invoice.vat')} (${detail.totals.vatRate}%)`, detail.totals.totalVat, 'normal'],
      [this.i18n.t('common.total'), detail.totals.parentPayable, 'grand'],
      [this.i18n.t('customer.amount_paid'), detail.totals.paid, 'normal'],
      [this.i18n.t('customer.remaining'), detail.totals.remaining, 'remaining'],
    ];
    const totalX = 91; const totalWidth = 104; const rowHeight = 9;
    totals.forEach(([label, value, style], index) => {
      const rowY = summaryY + index * rowHeight;
      if (style === 'grand') { pdf.setFillColor(...navy); pdf.rect(totalX, rowY, totalWidth, rowHeight, 'F'); pdf.setTextColor(255, 255, 255); }
      else if (style === 'remaining') { pdf.setFillColor(255, 247, 247); pdf.rect(totalX, rowY, totalWidth, rowHeight, 'F'); pdf.setTextColor(165, 31, 53); }
      else { pdf.setTextColor(28, 35, 51); }
      pdf.setDrawColor(220, 225, 234); pdf.rect(totalX, rowY, totalWidth, rowHeight);
      pdf.setFontSize(style === 'grand' ? 8.5 : 7.5);
      pdf.text(tx(label), rtl ? totalX + totalWidth - 4 : totalX + 4, rowY + 6, { align: rtl ? 'right' : 'left' });
      pdf.text(money(value), rtl ? totalX + 4 : totalX + totalWidth - 4, rowY + 6, { align: rtl ? 'left' : 'right' });
    });
    pdf.setFontSize(7); pdf.setTextColor(...navy); pdf.text(tx(rtl ? detail.school.nameAr : detail.school.nameEn), 105, 272, { align: 'center' });
    pdf.setTextColor(...muted); pdf.text(tx(rtl ? detail.school.addressAr : detail.school.addressEn), 105, 277, { align: 'center', maxWidth: 170 });
    pdf.text(`${detail.school.phone || ''}${detail.school.phone && detail.school.email ? '  |  ' : ''}${detail.school.email || ''}`, 105, 282, { align: 'center' });
    pdf.save(`invoice-${detail.invoice.invoiceNumber}.pdf`);
  }

  private invoiceQr(detail: InvoiceDetail): Promise<string> {
    return QRCode.toDataURL(JSON.stringify({ invoiceId: detail.invoice.id, invoiceNumber: detail.invoice.invoiceNumber, parentPayable: detail.totals.parentPayable, vat: detail.totals.totalVat, governmentBorneVat: detail.totals.governmentBorneVat, taxTreatment: detail.totals.taxTreatment }), { margin: 1, width: 420 });
  }
}
