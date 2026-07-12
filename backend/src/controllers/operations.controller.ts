import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { asyncController } from "./core.controller.js";
import { AdminService } from "../services/admin.service.js";
import { PayrollService } from "../services/payroll.service.js";
import { ReportService } from "../services/report.service.js";
import { EnterpriseReportService } from "../services/enterprise-report.service.js";
import { StaffService } from "../services/staff.service.js";
const actor = (r: AuthRequest) => ({
  id: r.user?.id,
  displayName: r.user?.displayName,
  role: r.user?.role,
});
export class OperationsController {
  private admin;
  private staff;
  private payroll;
  private reports;
  private enterpriseReports;
  constructor(prisma: PrismaClient) {
    this.admin = new AdminService(prisma);
    this.staff = new StaffService(prisma);
    this.payroll = new PayrollService(prisma);
    this.reports = new ReportService(prisma);
    this.enterpriseReports = new EnterpriseReportService(prisma);
  }
  api = asyncController(async (_r, s) =>
    s.json({
      ok: true,
      service: "rawafed-backend",
      message: "Rawafed backend API is running.",
      health: "/api/health",
      login: "/api/auth/login",
    }),
  );
  exportAll = asyncController(async (_r, s) => {
    s.setHeader("Content-Type", "application/json; charset=utf-8");
    s.setHeader(
      "Content-Disposition",
      `attachment; filename="rawafed-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    s.json(await this.admin.exportAll());
  });
  integrity = asyncController(async (_r, s) =>
    s.json(await this.admin.integrity()),
  );
  announcement = asyncController(async (r, s) =>
    s.status(201).json(await this.admin.announcement(r.body, actor(r))),
  );
  staffList = asyncController(async (_r, s) => s.json(await this.staff.list()));
  staffCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.staff.create(r.body, actor(r))),
  );
  staffUpdate = asyncController(async (r, s) =>
    s.json(await this.staff.update(r.params.id, r.body, actor(r))),
  );
  staffArchive = asyncController(async (r, s) => {
    await this.staff.archive(r.params.id, actor(r));
    s.status(204).send();
  });
  payrollList = asyncController(async (_r, s) =>
    s.json(await this.payroll.list()),
  );
  payrollCreate = asyncController(async (r, s) =>
    s.status(201).json(await this.payroll.create(r.body, actor(r))),
  );
  admissions = asyncController(async (r, s) =>
    s.json(
      await this.reports.admissions(
        String(r.query.from || ""),
        String(r.query.to || ""),
      ),
    ),
  );
  finance = asyncController(async (r, s) =>
    s.json(
      await this.reports.finance(
        String(r.query.from || ""),
        String(r.query.to || ""),
      ),
    ),
  );
  outstanding = asyncController(async (_r, s) =>
    s.json(await this.reports.outstanding()),
  );
  daily = asyncController(async (r, s) =>
    s.json(
      await this.reports.daily(
        String(r.query.date || new Date().toISOString().slice(0, 10)),
      ),
    ),
  );
  monthly = asyncController(async (r, s) =>
    s.json(
      await this.reports.monthly(
        String(r.query.month || new Date().toISOString().slice(0, 7)),
      ),
    ),
  );
  reportCatalog = asyncController(async (_r, s) =>
    s.json(this.enterpriseReports.catalog()),
  );
  reportRun = asyncController(async (r, s) =>
    s.json(
      await this.enterpriseReports.run(
        r.params.type,
        r.body?.filters || r.body || {},
        r.body?.options || {},
      ),
    ),
  );
  reportTemplates = asyncController(async (r, s) =>
    s.json(await this.enterpriseReports.templates(r.user!.id)),
  );
  reportTemplateSave = asyncController(async (r, s) =>
    s
      .status(201)
      .json(await this.enterpriseReports.saveTemplate(r.user!.id, r.body)),
  );
  reportTemplateDelete = asyncController(async (r, s) => {
    await this.enterpriseReports.removeTemplate(r.user!.id, r.params.id);
    s.status(204).send();
  });
  reportReconciliation = asyncController(async (_r, s) =>
    s.json(await this.enterpriseReports.reconciliation()),
  );
}
