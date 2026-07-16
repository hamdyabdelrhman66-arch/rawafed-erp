import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { AccountingController } from "../controllers/accounting.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as validators from "../validators/accounting.validators.js";
import { requirePermission } from "../middlewares/permission.middleware.js";

export function postgresAccountingRoutes(prisma: PrismaClient): Router {
  const r = Router(),
    c = new AccountingController(prisma),
    secured = [requireAuth, requireActiveSession(prisma)] as const,
    read = requireRole([
      "Finance",
      "Finance Manager",
      "Chief Accountant",
      "Accountant",
      "Auditor",
    ]),
    write = requireRole(["Finance", "Finance Manager", "Chief Accountant"]);
  r.get("/api/accounting/accounts", ...secured, read, c.listAccounts);
  r.get(
    "/api/accounting/accounts/:id/details",
    ...secured,
    read,
    c.accountDetails,
  );
  r.get(
    "/api/accounting/accounts/suggest-code",
    ...secured,
    write,
    c.suggestCode,
  );
  r.post("/api/accounting/accounts", ...secured, write, c.createAccount);
  r.patch("/api/accounting/accounts/:id", ...secured, write, c.updateAccount);
  r.delete("/api/accounting/accounts/:id", ...secured, write, c.archiveAccount);
  r.patch(
    "/api/accounting/accounts/:id/archive",
    ...secured,
    write,
    c.archiveAccount,
  );
  r.patch(
    "/api/accounting/accounts/:id/move",
    ...secured,
    write,
    c.moveAccount,
  );
  r.get("/api/accounting/cost-centers", ...secured, read, c.costCenters);
  r.get(
    "/api/accounting/expense-accounts",
    ...secured,
    read,
    c.expenseAccounts,
  );
  r.get(
    "/api/accounting/payment-accounts",
    ...secured,
    read,
    c.paymentAccounts,
  );
  r.get(
    "/api/accounting/revenue-accounts",
    ...secured,
    read,
    c.revenueAccounts,
  );
  r.get(
    "/api/accounting/receivable-accounts",
    ...secured,
    read,
    c.receivableAccounts,
  );
  r.get(
    "/api/accounting/payable-accounts",
    ...secured,
    read,
    c.payableAccounts,
  );
  r.get("/api/accounting/journal-entries", ...secured, requirePermission(prisma, "journals.view"), c.journals);
  r.get("/api/accounting/journal-entries/summary", ...secured, requirePermission(prisma, "journals.view"), c.journalSummary);
  r.get("/api/accounting/journal-entries/:id", ...secured, requirePermission(prisma, "journals.view"), c.journalDetails);
  r.post("/api/accounting/journal-entries", ...secured, requirePermission(prisma, "journals.create.manual"), validate(validators.journalEntry), c.createJournal);
  r.patch(
    "/api/accounting/journal-entries/:id",
    ...secured,
    requirePermission(prisma, "journals.edit.draft"),
    validate(validators.journalEntry),
    c.updateJournal,
  );
  r.delete(
    "/api/accounting/journal-entries/:id",
    ...secured,
    requirePermission(prisma, "journals.cancel.draft"),
    c.deleteJournal,
  );
  r.post(
    "/api/accounting/journal-entries/:id/reverse",
    ...secured,
    requirePermission(prisma, "journals.reverse"),
    c.reverseJournal,
  );
  for (const [action, permission] of [["submit", "journals.submit"], ["approve", "journals.approve"], ["post", "journals.post"], ["cancel", "journals.cancel.draft"]] as const) {
    r.post(`/api/accounting/journal-entries/:id/${action}`, ...secured, requirePermission(prisma, permission), c.transitionJournal);
  }
  r.post("/api/accounting/journal-entries/:id/correct", ...secured, requirePermission(prisma, "journals.correct.posted"), validate(validators.journalCorrection), c.correctJournal);
  r.get("/api/accounting/periods", ...secured, requirePermission(prisma, "journals.view"), c.accountingPeriods);
  r.patch("/api/accounting/periods/:id", ...secured, requirePermission(prisma, "accounting.periods.manage"), validate(validators.accountingPeriod), c.updateAccountingPeriod);
  r.get("/api/accounting/ledger/:accountId", ...secured, read, c.ledger);
  r.get("/api/accounting/trial-balance", ...secured, read, c.trialBalance);
  r.get("/api/accounting/dashboard", ...secured, read, c.dashboard);
  r.get(
    "/api/accounting/income-statement",
    ...secured,
    read,
    c.incomeStatement,
  );
  r.get("/api/accounting/balance-sheet", ...secured, read, c.balanceSheet);
  r.get("/api/accounting/cash-flow", ...secured, read, c.cashFlow);
  r.get("/api/accounting/vat", ...secured, read, c.vatSummary);
  r.get(
    "/api/accounting/reconciliation",
    ...secured,
    requireRole([
      "Super Admin",
      "Finance Manager",
      "Chief Accountant",
      "Auditor",
    ]),
    c.reconcile,
  );
  r.get("/api/accounting/customers", ...secured, read, c.customers);
  r.get("/api/accounting/customers/:id", ...secured, read, c.customer);
  r.get(
    "/api/accounting/customers/:id/statement",
    ...secured,
    read,
    c.customerStatement,
  );
  r.get(
    "/api/accounting/customers/:id/installments",
    ...secured,
    read,
    c.installments,
  );
  r.post(
    "/api/accounting/customers/:id/installment-plans",
    ...secured,
    write,
    validate(validators.installmentPlan),
    c.createPlan,
  );
  r.post(
    "/api/accounting/customer-payments",
    ...secured,
    write,
    c.customerPayment,
  );
  r.get("/api/accounting/suppliers", ...secured, read, c.suppliers);
  r.post("/api/accounting/suppliers", ...secured, write, c.createSupplier);
  r.get("/api/accounting/suppliers/:id/profile", ...secured, read, c.supplier);
  r.get(
    "/api/accounting/suppliers/:id/statement",
    ...secured,
    read,
    c.supplierStatement,
  );
  r.patch("/api/accounting/suppliers/:id", ...secured, write, c.updateSupplier);
  r.delete(
    "/api/accounting/suppliers/:id",
    ...secured,
    write,
    c.archiveSupplier,
  );
  r.post(
    "/api/accounting/supplier-payments",
    ...secured,
    write,
    c.supplierPayment,
  );
  r.get("/api/accounting/supplier-aging", ...secured, read, c.supplierAging);
  r.get("/api/accounting/cashboxes", ...secured, read, c.cashboxes);
  r.post("/api/accounting/cashboxes", ...secured, write, c.createCashbox);
  r.patch("/api/accounting/cashboxes/:id", ...secured, write, c.updateCashbox);
  r.get("/api/accounting/banks", ...secured, read, c.banks);
  r.post("/api/accounting/banks", ...secured, write, c.createBank);
  r.patch("/api/accounting/banks/:id", ...secured, write, c.updateBank);
  r.post("/api/accounting/transfers", ...secured, write, c.transfer);
  r.get("/api/accounting/search", ...secured, read, c.search);
  r.get("/api/finance/expenses", ...secured, read, c.expenseList);
  r.get("/api/finance/expenses/:id", ...secured, read, c.expenseGet);
  r.post("/api/finance/expenses", ...secured, write, validate(validators.expense), c.expenseCreate);
  r.post("/api/finance/expenses/:id/payments", ...secured, write, validate(validators.expensePayment), c.expensePay);
  return r;
}
