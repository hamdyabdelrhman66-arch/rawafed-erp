import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vat: number;
  total: number;
}

export interface InvoicePdfDocument {
  invoiceNumber: string;
  status?: string;
  date?: string;
  studentName?: string;
  registrationNumber?: string;
  category?: string;
  paymentMethod?: string;
  schoolNameAr?: string;
  schoolNameEn?: string;
  addressAr?: string;
  addressEn?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
  lines: InvoicePdfLine[];
  subtotal: number;
  discount?: number;
  vat: number;
  total: number;
  paid: number;
  remaining: number;
  qrDataUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  async download(document: InvoicePdfDocument): Promise<void> {
    const bytes = await this.build(document);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `invoice-${document.invoiceNumber || 'generated'}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async build(
    document: InvoicePdfDocument,
    suppliedFont?: Uint8Array,
    suppliedLogo?: Uint8Array | null,
  ): Promise<Uint8Array> {
    const [font, logo] = await Promise.all([
      suppliedFont ? Promise.resolve(suppliedFont) : this.asset('/fonts/Cairo.ttf'),
      suppliedLogo !== undefined
        ? Promise.resolve(suppliedLogo)
        : this.asset('/assets/rawafed-logo.png').catch(() => null),
    ]);
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    this.installFont(pdf, font);
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    const margin = 42;
    const navy = [29, 28, 80] as const;
    const red = [190, 47, 47] as const;

    pdf.setFillColor(...navy); pdf.rect(0, 0, width, 13, 'F');
    pdf.setFillColor(...red); pdf.rect(width - 150, 13, 150, 7, 'F');
    if (logo) pdf.addImage(this.dataUrl(logo, 'image/png'), 'PNG', width - 120, 35, 72, 72, undefined, 'FAST');
    pdf.setTextColor(...navy); pdf.setFontSize(17);
    this.text(pdf, document.schoolNameAr || 'مدارس روافد الشرق الأوسط العالمية', width - 135, 55, true);
    pdf.setFontSize(8); pdf.setTextColor(90, 102, 120);
    this.text(pdf, document.schoolNameEn || 'Rawafed International School', width - 135, 71, true);
    this.text(pdf, document.addressAr || '', width - 135, 84, true);
    this.text(pdf, [document.phone, document.email].filter(Boolean).join(' · '), width - 135, 97, true);

    pdf.setTextColor(...red); pdf.setFontSize(12); this.text(pdf, 'فاتورة ضريبية', margin, 49, false);
    pdf.setTextColor(...navy); pdf.setFontSize(11); pdf.text(document.invoiceNumber || '—', margin, 68);
    pdf.setFontSize(8); pdf.setTextColor(110, 90, 70); pdf.text(document.status || '', margin, 83);
    pdf.setDrawColor(...navy); pdf.line(margin, 122, width - margin, 122);

    const meta = [
      ['التاريخ', document.date || '—'], ['الطالب', document.studentName || '—'],
      ['رقم التسجيل', document.registrationNumber || '—'], ['الفئة', document.category || '—'],
      ['طريقة الدفع', document.paymentMethod || '—'], ['الرقم الضريبي', document.vatNumber || '—'],
    ];
    let y = 140;
    meta.forEach(([label, value], index) => {
      const col = index % 3; const row = Math.floor(index / 3);
      const cellW = (width - margin * 2) / 3; const x = margin + col * cellW;
      const top = y + row * 42;
      pdf.setFillColor(248, 250, 252); pdf.rect(x, top, cellW, 38, 'F');
      pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); this.text(pdf, label, x + cellW - 7, top + 12, true);
      pdf.setFontSize(8); pdf.setTextColor(15, 23, 42); this.text(pdf, value, x + cellW - 7, top + 28, true);
    });

    y = 235;
    const headers = ['الوصف', 'الكمية', 'سعر الوحدة', 'قبل الضريبة', 'الضريبة', 'الإجمالي'];
    const proportions = [0.32, 0.09, 0.15, 0.16, 0.12, 0.16];
    const contentW = width - margin * 2;
    const drawTableHeader = () => {
      pdf.setFillColor(235, 242, 251); pdf.rect(margin, y, contentW, 25, 'F');
      let x = width - margin;
      headers.forEach((header, index) => {
        const cellW = contentW * proportions[index]; x -= cellW;
        pdf.setFontSize(7); pdf.setTextColor(...navy); this.text(pdf, header, x + cellW - 5, y + 16, true);
      });
      y += 25;
    };
    drawTableHeader();
    for (const line of document.lines.length ? document.lines : [{ description: '—', quantity: 0, unitPrice: 0, subtotal: 0, vat: 0, total: 0 }]) {
      if (y > height - 210) { pdf.addPage(); y = 45; drawTableHeader(); }
      const values = [line.description, line.quantity, this.money(line.unitPrice), this.money(line.subtotal), this.money(line.vat), this.money(line.total)];
      let x = width - margin;
      values.forEach((value, index) => {
        const cellW = contentW * proportions[index]; x -= cellW;
        pdf.setFontSize(7); pdf.setTextColor(30, 41, 59); this.text(pdf, String(value), x + cellW - 5, y + 17, true);
      });
      pdf.setDrawColor(226, 232, 240); pdf.line(margin, y + 25, width - margin, y + 25); y += 25;
    }

    y += 18;
    if (document.qrDataUrl) pdf.addImage(document.qrDataUrl, 'PNG', margin, y, 105, 105, undefined, 'FAST');
    const summaryX = width - margin - 245;
    const summary = [
      ['المبلغ قبل الضريبة', document.subtotal], ['الخصومات', document.discount || 0],
      ['ضريبة القيمة المضافة', document.vat], ['الإجمالي', document.total],
      ['المدفوع', document.paid], ['المتبقي', document.remaining],
    ];
    summary.forEach(([label, amount], index) => {
      const top = y + index * 24;
      if (index === 3) { pdf.setFillColor(...navy); pdf.rect(summaryX, top, 245, 24, 'F'); pdf.setTextColor(255, 255, 255); }
      else { pdf.setFillColor(index === 5 ? 255 : 248, index === 5 ? 245 : 250, index === 5 ? 245 : 252); pdf.rect(summaryX, top, 245, 24, 'F'); pdf.setTextColor(index === 5 ? 180 : 30, 41, 59); }
      pdf.setFontSize(8); this.text(pdf, label, summaryX + 235, top + 16, true); pdf.text(`${this.money(Number(amount))} SAR`, summaryX + 8, top + 16);
    });
    pdf.setDrawColor(203, 213, 225); pdf.line(margin, height - 42, width - margin, height - 42);
    pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); this.text(pdf, document.addressAr || '', width - margin, height - 27, true);
    return new Uint8Array(pdf.output('arraybuffer'));
  }

  private async asset(path: string): Promise<Uint8Array> {
    const response = await fetch(path); if (!response.ok) throw new Error(`Could not load ${path}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  private installFont(pdf: jsPDF, bytes: Uint8Array): void {
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pdf.addFileToVFS('Cairo.ttf', btoa(binary)); pdf.addFont('Cairo.ttf', 'Cairo', 'normal'); pdf.setFont('Cairo');
  }
  private text(pdf: jsPDF, value: unknown, x: number, y: number, rtl: boolean): void {
    const raw = String(value ?? '—'); const text = /[\u0600-\u06ff]/.test(raw) ? pdf.processArabic(raw) : raw;
    pdf.text(text, x, y, { align: rtl ? 'right' : 'left' });
  }
  private money(value: number): string { return (Math.round(Number(value || 0) * 100) / 100).toFixed(2); }
  private dataUrl(bytes: Uint8Array, mime: string): string {
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(binary)}`;
  }
}
