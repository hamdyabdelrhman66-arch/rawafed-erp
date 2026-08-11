import { Workbook } from "exceljs";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  ReportExportService,
  type ReportTable,
} from "../../src/app/core/reports/report-export.service";
import { InvoicePdfService } from "../../src/app/core/reports/invoice-pdf.service";

const rows = Array.from({ length: 50 }, (_, index) => [
  `2026-07-${String((index % 12) + 1).padStart(2, "0")}`,
  `مستخدم ${index + 1}`,
  index % 2 ? "إلغاء دفعة" : "اعتماد فاتورة",
  (index + 1) * 100,
]);
const report: ReportTable = {
  title: "Audit report",
  titleAr: "تقرير التدقيق المالي",
  subtitle: "Q2 2026 | الربع الثاني",
  columns: ["التاريخ", "المستخدم", "الإجراء", "المبلغ"],
  rows,
  summary: [{ label: "عدد السجلات", value: rows.length }],
  fileName: "audit-report",
  direction: "rtl",
  locale: "ar",
  chart: { labels: ["أبريل", "مايو", "يونيو"], values: [10, 20, 30] },
};

describe("Excel and PDF report exports", () => {
  it("creates a real RTL workbook with data and reconciliation sheets", async () => {
    const bytes = await new ReportExportService().buildExcel(report);
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Report",
      "Data",
      "Checks",
    ]);
    const data = workbook.getWorksheet("Data")!;
    expect(data.views[0].rightToLeft).toBe(true);
    expect(data.rowCount).toBe(51);
    expect(data.getCell("A2").value).toBeInstanceOf(Date);
    expect(data.getColumn(1).numFmt).toBe("yyyy-mm-dd");
    expect(data.getCell("B2").value).toBe("مستخدم 1");
    expect(data.getColumn(2).numFmt).toBeUndefined();
    expect(data.getColumn(4).numFmt).toBe("#,##0.00;[Red](#,##0.00);-");
    expect(
      (workbook.getWorksheet("Checks")!.getCell("E2").value as { formula: string })
        .formula,
    ).toBe('IF(D2=0,"PASS","FAIL")');
  });

  it("builds three Arabic PDF pages with repeated headers and stable numbering", () => {
    const exporter = new ReportExportService();
    const chunks = Array.from({ length: Math.ceil(rows.length / 18) }, (_, index) =>
      rows.slice(index * 18, (index + 1) * 18),
    );
    const pages = chunks.map((chunk, index) =>
      exporter.pdfPageHtml(report, chunk, index + 1, chunks.length),
    );
    expect(pages).toHaveLength(3);
    for (const [index, page] of pages.entries()) {
      expect(page).toContain("تقرير التدقيق المالي");
      expect(page).toContain("التاريخ");
      expect(page).toContain(`dir="ltr">${index + 1} / 3`);
    }
    expect(pages[0]).toContain("أبريل");
    expect(pages[1]).not.toContain("أبريل");
  });

  it("creates a vector PDF whose report text remains extractable", async () => {
    const font = new Uint8Array(
      await readFile(new URL("../../public/fonts/Amiri-Regular.ttf", import.meta.url)),
    );
    const bytes = await new ReportExportService().buildPdf(report, font);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const document = await getDocument({ data: bytes }).promise;
    expect(document.numPages).toBeGreaterThan(1);
    const firstPage = await document.getPage(1);
    const content = await firstPage.getTextContent();
    const extracted = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(extracted).toContain("2026");
    expect(extracted).toContain("100");
    expect(extracted.normalize("NFKC")).toContain("تقرير التدقيق المالي");
    expect(extracted.normalize("NFKC")).toContain("اعتماد فاتورة");
  });

  it("creates a searchable vector invoice without rasterizing the document", async () => {
    const font = new Uint8Array(
      await readFile(new URL("../../public/fonts/Amiri-Regular.ttf", import.meta.url)),
    );
    const bytes = await new InvoicePdfService().build({
      invoiceNumber: "RAW-INV-2026-001",
      date: "2026-08-10",
      studentName: "Test Student",
      registrationNumber: "RAW-2026-001",
      lines: [{ description: "Tuition", quantity: 1, unitPrice: 14000, subtotal: 14000, vat: 0, total: 14000 }],
      subtotal: 14000,
      discount: 445,
      vat: 0,
      total: 13555,
      paid: 5000,
      remaining: 8555,
    }, font, null);
    const document = await getDocument({ data: bytes }).promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const extracted = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(extracted).toContain("RAW-INV-2026-001");
    expect(extracted).toContain("14000.00");
    expect(extracted).toContain("445.00");
    expect(extracted).toContain("8555.00");
  });
});
