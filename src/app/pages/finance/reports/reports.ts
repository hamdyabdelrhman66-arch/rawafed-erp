import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "../../../core/auth/auth.service";
import { I18nService } from "../../../core/i18n/i18n.service";
import {
  EnterpriseReportApiService,
  EnterpriseReportResult,
  ReportDefinition,
} from "../../../core/reports/enterprise-report.service";
import {
  ReportExportService,
  ReportTable,
} from "../../../core/reports/report-export.service";

@Component({
  selector: "app-reports",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./reports.html",
  styleUrls: ["./reports.css", "../../../shared/finance/finance-ui.scss"],
})
export class Reports implements OnInit {
  catalog: ReportDefinition[] = [];
  selectedType = "finance";
  result: EnterpriseReportResult | null = null;
  templates: any[] = [];
  selectedTemplateId = "";
  templateName = "";
  chartType = "bar";
  groupBy = "";
  sortBy = "";
  loading = false;
  error = "";
  visibleColumns = new Set<string>();
  filters: Record<string, string> = {
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    academicYearId: "",
    branchId: "",
    grade: "",
    studentId: "",
    accountId: "",
    costCenterId: "",
    supplierId: "",
    warehouseId: "",
    itemId: "",
    paymentMethod: "",
    status: "",
    quarter: "",
    month: "",
    year: "",
  };
  readonly filterLabels: Record<string, string> = {
    from: "Date from",
    to: "Date to",
    academicYearId: "Academic year",
    branchId: "Branch",
    grade: "Grade",
    studentId: "Student",
    accountId: "Account",
    costCenterId: "Cost center",
    supplierId: "Supplier",
    warehouseId: "Warehouse",
    itemId: "Item",
    paymentMethod: "Payment method",
    status: "Status",
    quarter: "Quarter",
    month: "Month",
    year: "Year",
  };

  constructor(
    private readonly reports: EnterpriseReportApiService,
    private readonly exporter: ReportExportService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
    public readonly i18n: I18nService,
  ) {}
  async ngOnInit(): Promise<void> {
    [this.catalog, this.templates] = await Promise.all([
      this.reports.catalog(),
      this.reports.templates(),
    ]);
    const requested = this.route.snapshot.queryParamMap.get("report");
    if (requested && this.catalog.some((item) => item.id === requested))
      this.selectedType = requested;
    await this.run();
  }
  get definition(): ReportDefinition | undefined {
    return this.catalog.find((item) => item.id === this.selectedType);
  }
  get columns(): string[] {
    return (this.result?.columns || []).filter((column) =>
      this.visibleColumns.has(column),
    );
  }
  get rows(): Array<Array<string | number | boolean | null>> {
    return (this.result?.rows || []).map((row) =>
      this.columns.map((column) => row[column]),
    );
  }
  get summaryEntries(): Array<{ label: string; value: string | number }> {
    return Object.entries(this.result?.summary || {}).map(([label, value]) => ({
      label,
      value,
    }));
  }
  get maxChartValue(): number {
    return Math.max(...(this.result?.chart.values || []).map(Math.abs), 1);
  }
  get linePoints(): string {
    const values = this.result?.chart.values || [];
    if (!values.length) return "";
    return values
      .map((value, index) => {
        const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
        const y = 96 - (Math.abs(value) / this.maxChartValue) * 88;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }
  get areaPoints(): string {
    return this.linePoints ? `0,100 ${this.linePoints} 100,100` : "";
  }
  get pieGradient(): string {
    const values = (this.result?.chart.values || []).map(Math.abs);
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const colors = [
      "#0b5ed7",
      "#14b8a6",
      "#f59e0b",
      "#7c3aed",
      "#ef4444",
      "#0891b2",
      "#84cc16",
      "#f97316",
    ];
    let cursor = 0;
    const segments = values.map((value, index) => {
      const start = cursor;
      cursor += (value / total) * 100;
      return `${colors[index % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return `conic-gradient(${segments.join(",")})`;
  }
  chartPercent(index: number): number {
    return (Math.abs(this.result?.chart.values[index] || 0) / this.maxChartValue) * 100;
  }
  chartColor(index: number): string {
    return ["#0b5ed7", "#14b8a6", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2"][index % 6];
  }
  async run(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      this.result = await this.reports.run(
        this.selectedType,
        Object.fromEntries(
          Object.entries(this.filters).filter(([, value]) => value),
        ),
        {
          groupBy: this.groupBy || undefined,
          sortBy: this.sortBy || undefined,
        },
      );
      this.visibleColumns = new Set(this.result.columns);
      this.chartType = this.definition?.chartTypes[0] || "bar";
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { report: this.selectedType },
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
    } catch (error: any) {
      this.error =
        error?.safeMessage ||
        error?.message ||
        "Report could not be generated.";
    } finally {
      this.loading = false;
    }
  }
  toggleColumn(column: string): void {
    this.visibleColumns.has(column)
      ? this.visibleColumns.delete(column)
      : this.visibleColumns.add(column);
  }
  async saveTemplate(): Promise<void> {
    if (!this.templateName.trim()) return;
    await this.reports.saveTemplate({
      name: this.templateName.trim(),
      reportType: this.selectedType,
      filters: this.filters,
      columns: [...this.visibleColumns],
      groupBy: this.groupBy || undefined,
      sortBy: this.sortBy || undefined,
      chartType: this.chartType,
    });
    this.templates = await this.reports.templates();
  }
  async loadTemplate(): Promise<void> {
    const template = this.templates.find(
      (item) => item.id === this.selectedTemplateId,
    );
    if (!template) return;
    this.selectedType = template.reportType;
    this.filters = { ...this.filters, ...(template.filters || {}) };
    this.groupBy = template.groupBy || "";
    this.sortBy = template.sortBy || "";
    this.chartType = template.chartType || "bar";
    await this.run();
    if (Array.isArray(template.columns) && template.columns.length)
      this.visibleColumns = new Set(template.columns);
  }
  async deleteTemplate(): Promise<void> {
    if (!this.selectedTemplateId) return;
    await this.reports.deleteTemplate(this.selectedTemplateId);
    this.templates = await this.reports.templates();
    this.selectedTemplateId = "";
  }
  async downloadPdf(): Promise<void> {
    if (this.result) await this.exporter.downloadPdf(this.exportModel());
  }
  async downloadExcel(): Promise<void> {
    if (this.result) await this.exporter.downloadExcel(this.exportModel());
  }
  print(): void {
    window.print();
  }
  format(value: unknown): string {
    return typeof value === "number"
      ? value.toLocaleString(
          this.i18n.language() === "ar" ? "ar-SA" : "en-US",
          { maximumFractionDigits: 2 },
        )
      : String(value ?? "-");
  }
  private exportModel(): ReportTable {
    const def = this.result!.definition;
    return {
      title: def.titleEn,
      titleAr: def.titleAr,
      subtitle: `${this.filters["from"] || "Start"} - ${this.filters["to"] || "Today"}`,
      description: def.category,
      columns: this.columns,
      rows: this.rows,
      summary: this.summaryEntries,
      fileName: `rawafed-${this.selectedType}-${this.filters["from"] || "all"}-${this.filters["to"] || "today"}`,
      direction: this.i18n.direction(),
      locale: this.i18n.language(),
      generatedBy: this.auth.session()?.displayName,
      academicYear: this.filters["academicYearId"],
      branch: this.filters["branchId"],
      chart: this.result!.chart,
      comparison: this.result!.comparison,
    };
  }
}
