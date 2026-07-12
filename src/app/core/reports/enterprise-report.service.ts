import { Injectable } from "@angular/core";
import { ApiService } from "../api/api.service";

export interface ReportDefinition {
  id: string;
  category: string;
  titleEn: string;
  titleAr: string;
  chartTypes: string[];
  filters: string[];
}
export interface EnterpriseReportResult {
  definition: ReportDefinition;
  filters: Record<string, string>;
  options: { groupBy?: string; sortBy?: string };
  generatedAt: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  summary: Record<string, string | number>;
  chart: { labels: string[]; values: number[]; valueKey?: string };
  comparison: {
    current: number;
    previous: number;
    difference: number;
    percentageChange: number | null;
    previousFrom: string;
    previousTo: string;
  } | null;
}

@Injectable({ providedIn: "root" })
export class EnterpriseReportApiService {
  constructor(private readonly api: ApiService) {}
  catalog() {
    return this.api.get<ReportDefinition[]>("/reports/catalog");
  }
  run(
    type: string,
    filters: Record<string, string>,
    options: { groupBy?: string; sortBy?: string } = {},
  ) {
    return this.api.post<EnterpriseReportResult>(`/reports/run/${type}`, {
      filters,
      options,
    });
  }
  templates() {
    return this.api.get<any[]>("/reports/templates");
  }
  saveTemplate(template: any) {
    return this.api.post<any>("/reports/templates", template);
  }
  deleteTemplate(id: string) {
    return this.api.delete<void>(`/reports/templates/${id}`);
  }
  reconciliation() {
    return this.api.get<any>("/reports/reconciliation");
  }
}
