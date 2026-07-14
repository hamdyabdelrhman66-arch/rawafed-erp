import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

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

  @ViewChild('invoiceSheet') invoiceSheet?: ElementRef<HTMLElement>;

  isExporting = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['qrData']) void this.refreshQrImage();
  }

  async downloadPdf(): Promise<void> {
    if (!this.invoiceSheet) {
      return;
    }

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
      pdf.save(`invoice-${this.invoice?.no || 'generated'}.pdf`);
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

  private async waitForImages(element: HTMLElement): Promise<void> {
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }),
    );
  }

  private async refreshQrImage(): Promise<void> {
    this.qrImageDataUrl = this.qrData ? await QRCode.toDataURL(this.qrData, { margin: 1, width: 133 }) : '';
  }
}
