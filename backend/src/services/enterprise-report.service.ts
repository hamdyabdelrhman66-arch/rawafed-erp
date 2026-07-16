import type { Prisma, PrismaClient } from "@prisma/client";
import { FinancialStatementsService } from "./financial-statements.service.js";
import { ReconciliationService } from "./reconciliation.service.js";
import { VatService } from "./vat.service.js";
import { ReportTemplateRepository } from "../repositories/report-template.repository.js";
import { ServiceError } from "./service.error.js";

type Filters = Record<string, string | undefined>;
type ReportOptions = { groupBy?: string; sortBy?: string };
type ReportRow = Record<string, string | number | boolean | null>;
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const iso = (value: Date | null | undefined) =>
  value?.toISOString().slice(0, 10) || "";
const period = (filters: Filters) => ({
  gte: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
  lte: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
});
const normalizedPeriod = (filters: Filters): Filters => {
  const next = { ...filters };
  const year = Number(filters.year || new Date().getFullYear());
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [monthYear, month] = filters.month.split("-").map(Number);
    next.from = `${filters.month}-01`;
    next.to = iso(new Date(Date.UTC(monthYear, month, 0)));
  } else if (filters.quarter && /^Q[1-4]$/.test(filters.quarter)) {
    const firstMonth = (Number(filters.quarter.slice(1)) - 1) * 3;
    next.from = iso(new Date(Date.UTC(year, firstMonth, 1)));
    next.to = iso(new Date(Date.UTC(year, firstMonth + 3, 0)));
  } else if (filters.year && /^\d{4}$/.test(filters.year)) {
    next.from = `${filters.year}-01-01`;
    next.to = `${filters.year}-12-31`;
  }
  return next;
};

export const REPORT_CATALOG = [
  ["admissions", "Admissions", "القبول"],
  ["students", "Students", "الطلاب"],
  ["finance", "Finance", "المالية"],
  ["accounting", "Accounting", "المحاسبة"],
  ["vat", "VAT", "ضريبة القيمة المضافة"],
  ["receivables", "Receivables", "الذمم المدينة"],
  ["payables", "Payables", "الذمم الدائنة"],
  ["cash-bank", "Cash and Bank", "النقد والبنوك"],
  ["revenue", "Revenue", "الإيرادات"],
  ["expenses", "Expenses", "المصروفات"],
  ["inventory", "Inventory", "المخزون"],
  ["books", "Books", "الكتب"],
  ["uniforms", "Uniforms", "الزي المدرسي"],
  ["activities", "Activities", "الأنشطة"],
  ["transportation", "Transportation", "النقل"],
  ["suppliers", "Suppliers", "الموردون"],
  ["purchases", "Purchases", "المشتريات"],
  ["warehouses", "Warehouses", "المستودعات"],
  ["payroll", "Payroll", "الرواتب"],
  ["staff", "Staff", "الموظفون"],
  ["audit-logs", "Audit Logs", "سجل التدقيق"],
  ["user-activity", "User Activity", "نشاط المستخدمين"],
  ["branches", "Branches", "الفروع"],
  ["cost-centers", "Cost Centers", "مراكز التكلفة"],
  ["academic-years", "Academic Years", "السنوات الدراسية"],
] as const;

export class EnterpriseReportService {
  constructor(private readonly prisma: PrismaClient) {}
  catalog() {
    return REPORT_CATALOG.map(([id, titleEn, titleAr]) => ({
      id,
      category: id,
      titleEn,
      titleAr,
      chartTypes: [
        "bar",
        "line",
        "area",
        "pie",
        "donut",
        "stacked-bar",
        "horizontal-bar",
        "waterfall",
      ],
      filters: [
        "from",
        "to",
        "academicYearId",
        "branchId",
        "grade",
        "studentId",
        "accountId",
        "costCenterId",
        "supplierId",
        "warehouseId",
        "itemId",
        "paymentMethod",
        "serviceCategory",
        "status",
        "quarter",
        "month",
        "year",
      ],
    }));
  }
  async run(
    type: string,
    filters: Filters = {},
    options: ReportOptions = {},
  ) {
    if (!REPORT_CATALOG.some(([id]) => id === type))
      throw new ServiceError("Unknown report type.", 404);
    const resolvedFilters = normalizedPeriod(filters);
    const rows = this.transform(
      await this.rows(type, resolvedFilters),
      options,
    );
    const numericColumns = rows.length
      ? Object.keys(rows[0]).filter((key) =>
          rows.some((row) => typeof row[key] === "number"),
        )
      : [];
    const totals = Object.fromEntries(
      numericColumns.map((key) => [
        key,
        money(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)),
      ]),
    );
    const definition = this.catalog().find((item) => item.id === type)!;
    return {
      definition,
      filters: resolvedFilters,
      options,
      generatedAt: new Date().toISOString(),
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows,
      summary: { rowCount: rows.length, ...totals },
      chart: this.chart(rows, numericColumns[0]),
      comparison: await this.comparison(
        type,
        resolvedFilters,
        totals[numericColumns[0]] || rows.length,
        options,
      ),
    };
  }
  templates(userId: string) {
    return new ReportTemplateRepository(this.prisma).list(userId);
  }
  saveTemplate(userId: string, input: any) {
    if (!input.name || !input.reportType)
      throw new ServiceError(
        "Template name and report type are required.",
        422,
      );
    return new ReportTemplateRepository(this.prisma).save(userId, input);
  }
  removeTemplate(userId: string, id: string) {
    return new ReportTemplateRepository(this.prisma).remove(userId, id);
  }

  private async rows(type: string, filters: Filters): Promise<ReportRow[]> {
    const dates = period(filters);
    if (type === "admissions")
      return (
        await this.prisma.registration.findMany({
          where: {
            deletedAt: null,
            branchId: filters.branchId,
            academicYearId: filters.academicYearId,
            grade: filters.grade,
            status: filters.status,
            submittedAt: dates,
          },
          orderBy: { submittedAt: "asc" },
        })
      ).map((r) => ({
        date: iso(r.submittedAt),
        registration: r.registrationNumber,
        student: r.studentName || "",
        grade: r.grade || "",
        status: r.status,
      }));
    if (type === "students")
      return (
        await this.prisma.student.findMany({
          where: {
            deletedAt: null,
            branchId: filters.branchId,
            grade: filters.grade,
            status: filters.status,
          },
          orderBy: { englishName: "asc" },
        })
      ).map((r) => ({
        registration: r.registrationNumber || "",
        student: r.englishName,
        grade: r.grade,
        status: r.status,
      }));
    if (type === "finance" || type === "receivables")
      return (
        await this.prisma.financeAccount.findMany({
          where: { deletedAt: null, studentId: filters.studentId },
          include: {
            student: true,
            registration: true,
            payments: { where: { status: "COMPLETED", deletedAt: null } },
          },
        })
      ).map((a) => {
        const paid = money(
          a.payments.reduce((n, p) => n + Number(p.amount), 0),
        );
        const expected = money(a.expectedTotal);
        return {
          registration: a.registration.registrationNumber,
          student: a.student.englishName,
          grade: a.student.grade,
          expected,
          paid,
          outstanding: money(expected - paid),
          status: expected <= paid ? "paid" : paid ? "partial" : "unpaid",
        };
      });
    if (type === "accounting") {
      const s = new FinancialStatementsService(this.prisma);
      const [tb, income, balance, cash] = await Promise.all([
        s.trialBalance(filters.from, filters.to),
        s.incomeStatement(filters.from, filters.to),
        s.balanceSheet(filters.to),
        s.cashFlow(filters.from, filters.to),
      ]);
      return [
        { metric: "Trial balance debit", amount: tb.totalDebit },
        { metric: "Trial balance credit", amount: tb.totalCredit },
        { metric: "Revenue", amount: income.revenue },
        { metric: "Expenses", amount: income.expenses },
        { metric: "Net income", amount: income.netIncome },
        { metric: "Assets", amount: balance.assets },
        { metric: "Liabilities", amount: balance.liabilities },
        { metric: "Equity", amount: balance.equity },
        { metric: "Net cash flow", amount: cash.netCashFlow },
      ];
    }
    if (type === "vat") {
      const vat = await new VatService(this.prisma).summary(
        filters.from,
        filters.to,
      );
      return [
        { metric: "Output VAT", amount: vat.outputVat },
        { metric: "Input VAT", amount: vat.inputVat },
        { metric: "VAT payable", amount: vat.vatPayable },
      ];
    }
    if (type === "payables" || type === "suppliers")
      return (
        await this.prisma.accountingSupplier.findMany({
          where: {
            deletedAt: null,
            id: filters.supplierId,
            active: filters.status ? filters.status === "active" : undefined,
          },
          include: { payments: true, expenses: true },
        })
      ).map((s) => ({
        code: s.supplierCode,
        supplier: s.nameEn,
        expenses: money(
          s.expenses.reduce((n, e) => n + Number(e.totalAmount), 0),
        ),
        payments: money(s.payments.reduce((n, p) => n + Number(p.amount), 0)),
        outstanding: money(
          Number(s.openingBalance) +
            s.expenses.reduce((n, e) => n + Number(e.totalAmount), 0) -
            s.payments.reduce((n, p) => n + Number(p.amount), 0),
        ),
      }));
    if (type === "revenue") {
      const status = filters.status ? String(filters.status).toUpperCase() as any : undefined;
      return (await this.prisma.financeInvoice.findMany({
        where: {
          deletedAt: null,
          issuedAt: dates,
          status,
          serviceCategory: filters.serviceCategory,
          branchId: filters.branchId,
          account: {
            studentId: filters.studentId,
            student: { grade: filters.grade },
            registration: { academicYearId: filters.academicYearId },
          },
          ...(filters.paymentMethod ? { payments: { some: { payment: { method: filters.paymentMethod, status: "COMPLETED", deletedAt: null } } } } : {}),
        },
        include: {
          account: { include: { student: true, registration: true } },
          lines: { include: { revenueAccount: true } },
          payments: { where: { payment: { status: "COMPLETED", deletedAt: null } }, include: { payment: true } },
        },
        orderBy: { issuedAt: "asc" },
      })).map((invoice) => ({
        date: iso(invoice.issuedAt),
        invoice: invoice.invoiceNumber,
        category: invoice.serviceCategory === "LEGACY_COMBINED" ? "Legacy Combined Invoice" : invoice.serviceCategory,
        student: invoice.account.student.englishName,
        grade: invoice.account.student.grade,
        branch: invoice.branchId || invoice.account.registration.branchId,
        subtotal: money(invoice.subtotal),
        vat: money(invoice.vatAmount),
        total: money(invoice.total),
        paid: money(invoice.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0)),
        remaining: money(Number(invoice.total) - invoice.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0)),
        paymentMethod: invoice.payments.map((allocation) => allocation.payment.method).filter((value, index, all) => all.indexOf(value) === index).join(", "),
        status: invoice.status,
        accountingAccount: invoice.lines[0]?.revenueAccount ? `${invoice.lines[0].revenueAccount.code} - ${invoice.lines[0].revenueAccount.name}` : "",
        costCenter: invoice.costCenterId || "",
      }));
    }
    if (["cash-bank", "expenses"].includes(type)) {
      const accountTypes =
        type === "revenue"
          ? ["REVENUE"]
          : type === "expenses"
            ? ["EXPENSE"]
            : ["ASSET"];
      const lines = await this.prisma.journalLine.findMany({
        where: {
          account: {
            type: { in: accountTypes as any },
            ...(type === "cash-bank"
              ? { OR: [{ isCashAccount: true }, { isBankAccount: true }] }
              : {}),
          },
          journalEntry: {
            status: { in: ["POSTED", "REVERSED"] },
            deletedAt: null,
            postingDate: dates,
          },
        },
        include: { account: true, journalEntry: true },
      });
      return lines.map((l) => ({
        date: iso(l.journalEntry.postingDate),
        account: `${l.account.code} - ${l.account.name}`,
        reference: l.journalEntry.referenceNumber || "",
        description: l.description || l.journalEntry.description,
        debit: money(l.debit),
        credit: money(l.credit),
        amount: money(
          type === "revenue"
            ? Number(l.credit) - Number(l.debit)
            : Number(l.debit) - Number(l.credit),
        ),
      }));
    }
    if (["books", "uniforms", "activities", "transportation"].includes(type)) {
      const category = ({ books: "BOOKS", uniforms: "UNIFORM", activities: "ACTIVITIES", transportation: "TRANSPORTATION" } as Record<string, string>)[type];
      const [invoices, costs] = await Promise.all([
        this.prisma.financeInvoice.findMany({
          where: {
            deletedAt: null, serviceCategory: category, issuedAt: dates, status: filters.status ? String(filters.status).toUpperCase() as any : undefined,
            account: { studentId: filters.studentId, student: { grade: filters.grade }, registration: { academicYearId: filters.academicYearId, branchId: filters.branchId } },
          },
          include: { account: { include: { student: true, registration: true } } },
        }),
        this.prisma.directCostEvent.findMany({ where: { category, eventDate: dates, studentId: filters.studentId } }),
      ]);
      if (type === "transportation") {
        const groups = new Map<string, { students: Set<string>; revenue: number; directCost: number }>();
        for (const invoice of invoices) {
          const data = invoice.account.registration.data as any;
          const area = String(data?.financial?.transportationArea || data?.financial?.transportationAreaName || "Unassigned");
          const group = groups.get(area) || { students: new Set<string>(), revenue: 0, directCost: 0 };
          group.students.add(invoice.account.studentId);
          group.revenue = money(group.revenue + Number(invoice.subtotal));
          groups.set(area, group);
        }
        for (const cost of costs) {
          const area = cost.area || "Unassigned";
          const group = groups.get(area) || { students: new Set<string>(), revenue: 0, directCost: 0 };
          group.directCost = money(group.directCost + Number(cost.amount));
          groups.set(area, group);
        }
        return [...groups.entries()].map(([area, value]) => ({
          area, studentsPerRoute: value.students.size, revenuePerArea: value.revenue,
          costPerArea: value.directCost, grossProfit: money(value.revenue - value.directCost),
        }));
      }
      const revenue = money(invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0));
      const directCost = money(costs.reduce((sum, cost) => sum + Number(cost.amount), 0));
      return [{ category, invoices: invoices.length, revenue, directCost, grossProfit: money(revenue - directCost) }];
    }
    if (type === "inventory") {
      const items = await this.prisma.inventoryItem.findMany({
        where: {
          deletedAt: null,
          id: filters.itemId,
          active: filters.status ? filters.status === "active" : undefined,
        },
        include: {
          category: true,
          stock: { where: { warehouseId: filters.warehouseId } },
          unit: true,
        },
      });
      return items.map((i) => {
        const quantity = i.stock.reduce((n, s) => n + Number(s.quantity), 0);
        const value = i.stock.reduce(
          (n, s) => n + Number(s.quantity) * Number(s.averageCost),
          0,
        );
        return {
          code: i.itemCode,
          item: i.name,
          category: i.category.name,
          unit: i.unit.name,
          quantity: money(quantity),
          averageCost: quantity ? money(value / quantity) : 0,
          valuation: money(value),
        };
      });
    }
    if (type === "purchases")
      return (
        await this.prisma.purchaseOrder.findMany({
          where: {
            deletedAt: null,
            supplierId: filters.supplierId,
            status: filters.status,
            createdAt: dates,
          },
          include: { supplier: true, lines: true },
        })
      ).map((o) => ({
        date: iso(o.createdAt),
        order: o.poNumber,
        supplier: o.supplier.nameEn,
        status: o.status,
        lines: o.lines.length,
        total: money(o.total),
      }));
    if (type === "warehouses")
      return (
        await this.prisma.warehouse.findMany({
          where: { deletedAt: null, id: filters.warehouseId },
          include: { stock: true, locations: true },
        })
      ).map((w) => ({
        code: w.code,
        warehouse: w.name,
        locations: w.locations.length,
        items: w.stock.length,
        quantity: money(w.stock.reduce((n, s) => n + Number(s.quantity), 0)),
        valuation: money(
          w.stock.reduce(
            (n, s) => n + Number(s.quantity) * Number(s.averageCost),
            0,
          ),
        ),
      }));
    if (type === "payroll")
      return (
        await this.prisma.payrollRun.findMany({
          where: { status: filters.status, period: filters.month },
          include: { lines: true },
        })
      ).map((p) => ({
        period: p.period,
        status: p.status,
        employees: p.lines.length,
        gross: money(p.lines.reduce((n, l) => n + Number(l.gross), 0)),
        deductions: money(
          p.lines.reduce((n, l) => n + Number(l.deductions), 0),
        ),
        net: money(p.lines.reduce((n, l) => n + Number(l.net), 0)),
      }));
    if (type === "staff")
      return (
        await this.prisma.staff.findMany({
          where: {
            deletedAt: null,
            status: filters.status,
            branchId: filters.branchId,
          },
        })
      ).map((s) => ({
        employee: s.idNumber || s.id,
        name: s.name,
        department: s.department || "",
        position: s.position || "",
        salary: money(s.salary),
        status: s.status,
      }));
    if (type === "audit-logs" || type === "user-activity")
      return (
        await this.prisma.auditLog.findMany({
          where: {
            actorId: type === "user-activity" ? filters.studentId : undefined,
            createdAt: dates,
          },
          include: { actor: true },
          orderBy: { createdAt: "desc" },
        })
      ).map((a) => ({
        date: a.createdAt.toISOString(),
        user: a.actor?.displayName || a.actorRole || "system",
        action: a.action,
        entity: a.entityType,
        entityId: a.entityId || "",
      }));
    if (type === "branches")
      return (
        await this.prisma.branch.findMany({ where: { deletedAt: null } })
      ).map((b) => ({ code: b.code, branch: b.name, active: b.active }));
    if (type === "cost-centers")
      return (
        await this.prisma.costCenter.findMany({ where: { deletedAt: null } })
      ).map((c) => ({
        code: c.code,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        active: c.active,
      }));
    if (type === "academic-years")
      return (
        await this.prisma.academicYear.findMany({
          where: { deletedAt: null, branchId: filters.branchId },
          include: { branch: true },
        })
      ).map((y) => ({
        branch: y.branch.name,
        academicYear: y.name,
        starts: iso(y.startsAt),
        ends: iso(y.endsAt),
        active: y.active,
      }));
    return [];
  }
  private chart(rows: ReportRow[], numeric?: string) {
    if (!numeric) return { labels: [], values: [] };
    const label = rows.length
      ? Object.keys(rows[0]).find((key) => typeof rows[0][key] === "string")
      : undefined;
    return {
      labels: rows
        .slice(0, 24)
        .map((row, i) => String((label && row[label]) || i + 1)),
      values: rows.slice(0, 24).map((row) => Number(row[numeric] || 0)),
      valueKey: numeric,
    };
  }
  private transform(rows: ReportRow[], options: ReportOptions) {
    let result = [...rows];
    if (options.groupBy && rows.some((row) => options.groupBy! in row)) {
      const numeric = [
        ...new Set(
          rows.flatMap((row) =>
            Object.keys(row).filter((key) => typeof row[key] === "number"),
          ),
        ),
      ];
      const groups = new Map<string, ReportRow>();
      for (const row of rows) {
        const key = String(row[options.groupBy] ?? "Unspecified");
        const aggregate = groups.get(key) || {
          [options.groupBy]: key,
          rowCount: 0,
        };
        aggregate.rowCount = Number(aggregate.rowCount) + 1;
        for (const column of numeric)
          aggregate[column] = money(
            Number(aggregate[column] || 0) + Number(row[column] || 0),
          );
        groups.set(key, aggregate);
      }
      result = [...groups.values()];
    }
    if (options.sortBy) {
      const descending = options.sortBy.startsWith("-");
      const column = descending ? options.sortBy.slice(1) : options.sortBy;
      result.sort((left, right) => {
        const a = left[column];
        const b = right[column];
        const order =
          typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a ?? "").localeCompare(String(b ?? ""), undefined, {
                numeric: true,
              });
        return descending ? -order : order;
      });
    }
    return result;
  }
  private async comparison(
    type: string,
    filters: Filters,
    current: number,
    options: ReportOptions,
  ) {
    if (!filters.from || !filters.to) return null;
    const from = new Date(filters.from),
      to = new Date(filters.to);
    let previousTo = new Date(from.getTime() - 86_400_000);
    let previousFrom: Date;
    if (filters.quarter && /^Q[1-4]$/.test(filters.quarter)) {
      previousFrom = new Date(
        Date.UTC(previousTo.getUTCFullYear(), previousTo.getUTCMonth() - 2, 1),
      );
    } else if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
      previousFrom = new Date(
        Date.UTC(previousTo.getUTCFullYear(), previousTo.getUTCMonth(), 1),
      );
    } else if (filters.year && /^\d{4}$/.test(filters.year)) {
      previousFrom = new Date(Date.UTC(previousTo.getUTCFullYear(), 0, 1));
    } else {
      const duration = to.getTime() - from.getTime() + 86_400_000;
      previousFrom = new Date(
        previousTo.getTime() - duration + 86_400_000,
      );
    }
    const previousRows = this.transform(
      await this.rows(type, {
        ...filters,
        from: iso(previousFrom),
        to: iso(previousTo),
        quarter: undefined,
        month: undefined,
        year: undefined,
      }),
      options,
    );
    const numericKey = previousRows.length
      ? Object.keys(previousRows[0]).find(
          (key) => typeof previousRows[0][key] === "number",
        )
      : undefined;
    const previous = numericKey
      ? money(
          previousRows.reduce((n, row) => n + Number(row[numericKey] || 0), 0),
        )
      : previousRows.length;
    const difference = money(Number(current) - previous);
    return {
      current: Number(current),
      previous,
      difference,
      percentageChange: previous
        ? money((difference / Math.abs(previous)) * 100)
        : null,
      previousFrom: iso(previousFrom),
      previousTo: iso(previousTo),
    };
  }
  reconciliation() {
    return new ReconciliationService(this.prisma).report();
  }
}
