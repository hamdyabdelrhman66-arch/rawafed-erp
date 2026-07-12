import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Workbook } from "exceljs";
import {
  ReportExportService,
  type ReportTable,
} from "../src/app/core/reports/report-export.service";

const run = promisify(execFile);
const outputDirectory = resolve("test-results/exports");
const xlsxPath = resolve(outputDirectory, "arabic-audit-report.xlsx");
const htmlPath = resolve(outputDirectory, "arabic-audit-report.html");
const pdfPath = resolve(outputDirectory, "arabic-audit-report.pdf");
const resultsPath = resolve(outputDirectory, "behavior-results.json");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pdfInfo =
  "/Users/m4/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdfinfo";

const rows = Array.from({ length: 50 }, (_, index) => [
  `2026-07-${String((index % 12) + 1).padStart(2, "0")}`,
  `مستخدم المالية ${index + 1}`,
  index % 2 ? "إلغاء دفعة" : "اعتماد فاتورة",
  `REF-${String(index + 1).padStart(4, "0")}`,
  (index + 1) * 125.5,
]);
const report: ReportTable = {
  title: "Audit Activity Report",
  titleAr: "تقرير نشاط التدقيق المالي",
  subtitle: "Q2 2026 | الربع الثاني ٢٠٢٦",
  description: "Behavioral export fixture",
  columns: ["التاريخ", "المستخدم", "الإجراء", "المرجع", "المبلغ"],
  rows,
  summary: [
    { label: "عدد السجلات", value: rows.length },
    { label: "إجمالي المبلغ", value: rows.reduce((sum, row) => sum + Number(row[4]), 0) },
    { label: "الفترة", value: "Q2 2026" },
  ],
  fileName: "arabic-audit-report",
  direction: "rtl",
  locale: "ar",
  generatedBy: "Rawafed ERP behavioral test",
  chart: {
    labels: ["أبريل", "مايو", "يونيو"],
    values: [12300, 15850, 17400],
    valueKey: "المبلغ",
  },
  comparison: {
    current: 45550,
    previous: 40100,
    difference: 5450,
    percentageChange: 13.59,
  },
};

async function main() {
await mkdir(outputDirectory, { recursive: true });
const exporter = new ReportExportService();
await writeFile(xlsxPath, await exporter.buildExcel(report));

const workbook = new Workbook();
await workbook.xlsx.readFile(xlsxPath);
const data = workbook.getWorksheet("Data");
const checks = workbook.getWorksheet("Checks");
const workbookAssertions = {
  threeSheets: workbook.worksheets.length === 3,
  allRowsExported: data?.rowCount === rows.length + 1,
  allColumnsExported: data?.columnCount === report.columns.length,
  rtl: data?.views[0]?.rightToLeft === true,
  arabicPreserved: data?.getCell("B2").value === "مستخدم المالية 1",
  reconciliationFormula:
    (checks?.getCell("E2").value as { formula?: string })?.formula ===
    'IF(D2=0,"PASS","FAIL")',
};
if (Object.values(workbookAssertions).some((value) => !value))
  throw new Error(`Workbook behavioral assertion failed: ${JSON.stringify(workbookAssertions)}`);

const chunks = Array.from({ length: Math.ceil(rows.length / 18) }, (_, index) =>
  rows.slice(index * 18, (index + 1) * 18),
);
const pages = chunks
  .map(
    (chunk, index) =>
      `<section class="page" dir="rtl">${exporter.pdfPageHtml(report, chunk, index + 1, chunks.length)}</section>`,
  )
  .join("")
  .replaceAll(
    "/assets/rawafed-logo.png",
    pathToFileURL(resolve("public/assets/rawafed-logo.png")).href,
  );
await writeFile(
  htmlPath,
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html{color-scheme:light;background:#fff}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#fff}.page{position:relative;width:210mm;height:297mm;padding:11mm 13mm;background:#fff;color:#0f172a;font-family:Arial,"Noto Sans Arabic",sans-serif;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}</style></head><body>${pages}</body></html>`,
  "utf8",
);
await run(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--disable-features=DarkMode",
  "--disable-force-dark",
  "--force-color-profile=srgb",
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`,
  pathToFileURL(htmlPath).href,
]);
const { stdout } = await run(pdfInfo, [pdfPath]);
const pageCount = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
const pdfBytes = (await readFile(pdfPath)).byteLength;
const pdfAssertions = {
  multiPage: pageCount === chunks.length,
  nonEmpty: pdfBytes > 20_000,
  repeatedHeaders: pages.split("التاريخ").length - 1 === chunks.length,
  arabicPreservedInMarkup: pages.includes("تقرير نشاط التدقيق المالي"),
  chartRendered: pages.includes("أبريل") && pages.includes("يونيو"),
};
if (Object.values(pdfAssertions).some((value) => !value))
  throw new Error(`PDF behavioral assertion failed: ${JSON.stringify(pdfAssertions)}`);

const result = {
  generatedAt: new Date().toISOString(),
  rows: rows.length,
  workbook: workbookAssertions,
  pdf: { ...pdfAssertions, pageCount, bytes: pdfBytes },
  files: { xlsxPath, pdfPath, htmlPath },
};
await writeFile(resultsPath, JSON.stringify(result, null, 2), "utf8");
process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
