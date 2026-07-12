import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import {
  ReportExportService,
  type ReportTable,
} from "../../src/app/core/reports/report-export.service";

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
    expect(data.getCell("B2").value).toBe("مستخدم 1");
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
});
