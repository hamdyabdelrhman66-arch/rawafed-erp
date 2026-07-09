import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

export interface ReportTable {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  summary: Array<{ label: string; value: string | number }>;
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class ReportExportService {
  private readonly backgroundPath = '/assets/report-background.jpg';

  downloadExcel(report: ReportTable): void {
    const rows = [
      [report.title],
      [report.subtitle],
      [],
      report.summary.map((item) => `${item.label}: ${item.value}`),
      [],
      report.columns,
      ...report.rows
    ];
    const csv = rows.map((row) => row.map((cell) => this.escapeCsv(cell)).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.fileName}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async downloadPdf(report: ReportTable): Promise<void> {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const background = await this.loadImage(this.backgroundPath);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 54;
    const bottom = pageHeight - 70;
    let y = 168;

    const addPage = () => {
      pdf.addImage(background, 'JPEG', 0, 0, pageWidth, pageHeight);
      pdf.setTextColor('#1d1c50');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text(this.pdfText(report.title), pageWidth / 2, 150, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor('#475569');
      pdf.text(this.pdfText(report.subtitle), pageWidth / 2, 166, { align: 'center' });
      y = 196;
    };

    addPage();

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    report.summary.forEach((item, index) => {
      const x = margin + (index % 3) * 162;
      const cardY = y + Math.floor(index / 3) * 42;
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(218, 226, 238);
      pdf.roundedRect(x, cardY, 150, 32, 5, 5, 'FD');
      pdf.setTextColor('#64748b');
      pdf.setFontSize(7);
      pdf.text(this.pdfText(item.label), x + 8, cardY + 12);
      pdf.setTextColor('#0f172a');
      pdf.setFontSize(10);
      pdf.text(this.pdfText(item.value), x + 8, cardY + 25);
    });
    y += Math.ceil(report.summary.length / 3) * 42 + 18;

    this.drawHeader(pdf, report.columns, margin, y);
    y += 24;

    report.rows.forEach((row) => {
      if (y > bottom) {
        addPage();
        this.drawHeader(pdf, report.columns, margin, y);
        y += 24;
      }

      this.drawRow(pdf, report.columns, row, margin, y);
      y += 22;
    });

    if (!report.rows.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor('#64748b');
      pdf.text('No records found for this report.', pageWidth / 2, y + 20, { align: 'center' });
    }

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor('#64748b');
      pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 36, { align: 'right' });
      pdf.text(`Generated: ${this.generatedAt()}`, margin, pageHeight - 36);
    }

    pdf.save(`${report.fileName}.pdf`);
  }

  private drawHeader(pdf: jsPDF, columns: string[], x: number, y: number): void {
    const widths = this.columnWidths(columns.length);
    pdf.setFillColor(29, 28, 80);
    pdf.setTextColor('#ffffff');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    let cursor = x;
    columns.forEach((column, index) => {
      pdf.rect(cursor, y, widths[index], 22, 'F');
      pdf.text(this.pdfText(column), cursor + 4, y + 14, { maxWidth: widths[index] - 8 });
      cursor += widths[index];
    });
  }

  private drawRow(pdf: jsPDF, columns: string[], row: Array<string | number>, x: number, y: number): void {
    const widths = this.columnWidths(columns.length);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#111827');
    let cursor = x;
    row.forEach((cell, index) => {
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(cursor, y, widths[index], 22);
      pdf.text(this.pdfText(cell), cursor + 4, y + 14, { maxWidth: widths[index] - 8 });
      cursor += widths[index];
    });
  }

  private columnWidths(count: number): number[] {
    const total = 486;
    return Array.from({ length: count }, () => total / count);
  }

  private escapeCsv(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  private pdfText(value: unknown): string {
    return String(value ?? '-')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '?')
      .replace(/\?+/g, '?')
      .slice(0, 160);
  }

  private generatedAt(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    return `${date} ${time}`;
  }

  private async loadImage(path: string): Promise<string> {
    const response = await fetch(path);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}
