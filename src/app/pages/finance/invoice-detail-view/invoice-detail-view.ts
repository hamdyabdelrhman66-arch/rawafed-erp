import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { AccountingService, InvoiceDetail } from '../../../core/finance/accounting.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { InvoicePdfDocument, InvoicePdfService } from '../../../core/reports/invoice-pdf.service';

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
    grade: { en: 'Grade', ar: 'الصف' },
    className: { en: 'Class', ar: 'الفصل' },
    route: { en: 'Route', ar: 'المسار' },
    area: { en: 'Area', ar: 'المنطقة' },
    size: { en: 'Size', ar: 'المقاس' },
    item: { en: 'Item', ar: 'الصنف' },
    activity: { en: 'Activity', ar: 'النشاط' },
    servicePeriod: { en: 'Service period', ar: 'فترة الخدمة' },
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly accounting: AccountingService,
    private readonly zatcaInvoice: ZatcaInvoiceService,
    private readonly feedback: FeedbackService,
    private readonly invoicePdf: InvoicePdfService,
    public readonly i18n: I18nService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.detail = await this.accounting.getInvoiceDetails(this.invoiceId);
      this.qrImage = await this.invoiceQr(this.detail);

      if (this.route.snapshot.queryParamMap.get('print') === '1') {
        await this.print();
      } else if (this.route.snapshot.queryParamMap.get('pdf') === '1') {
        await this.downloadPdf();
      }
    } catch (error) {
      this.error = safeErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  get invoiceId(): string {
    return String(this.route.snapshot.paramMap.get('invoiceId') || '');
  }

  get categoryEntries(): Array<[string, unknown]> {
    return Object.entries(this.detail?.categoryDetails || {});
  }

  label(key: string): string {
    const value = this.detailLabels[key];
    return value ? this.i18n.label(value.en, value.ar) : key;
  }

  money(value: unknown): string {
  return this.i18n.money(
    Number(value || 0),
    this.detail?.totals.currency || 'SAR',
  );
}

toNumber(value: unknown): number {
  return Number(value || 0);
}

isNoVat(): boolean {
  return this.toNumber(this.detail?.totals.vatRate) === 0;
}

lineVat(line: InvoiceDetail['lines'][number]): number {
  return this.isNoVat() ? 0 : this.toNumber(line.vatAmount);
}

lineTotal(line: InvoiceDetail['lines'][number]): number {
  return this.toNumber(line.netAmount) + this.lineVat(line);
}

displayedVatRate(): number {
  return this.isNoVat()
    ? 0
    : this.toNumber(this.detail?.totals.vatRate);
}

displayedInvoiceVat(): number {
  return this.isNoVat()
    ? 0
    : this.toNumber(this.detail?.totals.vatAmount);
}

invoiceTitle(): string {
  return this.isNoVat()
    ? this.i18n.language() === 'ar'
      ? 'فاتورة'
      : 'Invoice'
    : this.i18n.t('invoice.tax_invoice');
}

date(value: string | null | undefined): string {
  if (!value) return '-';

  return new Intl.DateTimeFormat(
    this.i18n.language() === 'ar' ? 'ar-SA' : 'en-GB',
  ).format(new Date(value));
}

  async print(): Promise<void> {
    if (this.busy) return;

    this.busy = true;

    try {
      this.detail = await this.accounting.authorizeInvoicePrint(this.invoiceId);
      this.qrImage = await this.invoiceQr(this.detail);
      await this.invoicePdf.print(this.pdfDocument(this.detail));
    } catch (error) {
      this.feedback.error(
        this.i18n.t('invoice.print_failed'),
        safeErrorMessage(error),
      );
    } finally {
      this.busy = false;
    }
  }

  async downloadPdf(): Promise<void> {
    if (this.busy) return;

    this.busy = true;

    try {
      this.detail = await this.accounting.authorizeInvoicePdf(this.invoiceId);
      this.qrImage = await this.invoiceQr(this.detail);
      await this.invoicePdf.download(this.pdfDocument(this.detail));
    } catch (error) {
      this.feedback.error(
        this.i18n.t('invoice.pdf_failed'),
        safeErrorMessage(error),
      );
    } finally {
      this.busy = false;
    }
  }

  private pdfDocument(data: InvoiceDetail): InvoicePdfDocument {
    return {
      invoiceNumber: data.invoice.invoiceNumber,
      status: data.invoice.status,
      date: this.date(data.invoice.issuedAt),
      studentName: this.i18n.language() === 'ar' ? data.student.nameAr || data.student.nameEn : data.student.nameEn,
      registrationNumber: data.student.registrationNumber,
      category: data.invoice.categoryLabel,
      schoolNameAr: data.school.nameAr,
      schoolNameEn: data.school.nameEn,
      addressAr: data.school.addressAr,
      addressEn: data.school.addressEn,
      phone: data.school.phone,
      email: data.school.email,
      vatNumber: data.school.vatNumber,
      qrDataUrl: this.qrImage,
      lines: data.lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        subtotal: Number(line.netAmount || 0),
        vat: this.lineVat(line),
        total: this.lineTotal(line),
      })),
      subtotal: Number(data.totals.subtotal || 0),
      discount: Number(data.totals.discount || 0) + Number(data.totals.additionalDiscount || 0),
      vat: this.displayedInvoiceVat(),
      total: Number(data.totals.parentPayable ?? data.totals.total ?? 0),
      paid: Number(data.totals.paid || 0),
      remaining: Number(data.totals.remaining || 0),
    };
  }

  private async waitForInvoiceRendering(): Promise<void> {
    await this.waitForFonts();
    await this.waitForImages();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  private async waitForFonts(): Promise<void> {
    const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontSet) return;

    try {
      await fontSet.ready;
    } catch {
      // Continue with available fonts if the browser cannot resolve font readiness.
    }
  }

  private async waitForImages(): Promise<void> {
    const invoiceElement = document.getElementById('invoice-print-content');
    if (!invoiceElement) return;

    const images = Array.from(invoiceElement.querySelectorAll('img'));

    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const finish = (): void => resolve();
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
          window.setTimeout(finish, 5000);
        });
      }),
    );
  }

  private invoiceQr(detail: InvoiceDetail): Promise<string> {
    const vatRate = Number(detail.totals.vatRate || 0);
    const parentVat = vatRate === 0
      ? 0
      : Number(detail.totals.vatAmount || 0);

    const zatcaPayload = this.zatcaInvoice.qrData({
      sellerName:
        detail.school.nameAr ||
        detail.school.nameEn ||
        this.zatcaInvoice.sellerName,
      taxNumber:
        detail.school.vatNumber ||
        this.zatcaInvoice.taxNumber,
      date: detail.invoice.issuedAt,
      total: Number(
        detail.totals.parentPayable ??
        detail.totals.total ??
        0,
      ),
      vat: parentVat,
    });

    return QRCode.toDataURL(zatcaPayload, {
      margin: 1,
      width: 420,
    });
  }
}
