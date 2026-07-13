import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { AccountingController } from "../controllers/accounting.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";

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
  r.get("/api/accounting/journal-entries", ...secured, read, c.journals);
  r.post("/api/accounting/journal-entries", ...secured, write, c.createJournal);
  r.patch(
    "/api/accounting/journal-entries/:id",
    ...secured,
    write,
    c.updateJournal,
  );
  r.delete(
    "/api/accounting/journal-entries/:id",
    ...secured,
    write,
    c.deleteJournal,
  );
  r.post(
    "/api/accounting/journal-entries/:id/reverse",
    ...secured,
    write,
    c.reverseJournal,
  );
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
  r.post("/api/finance/expenses", ...secured, write, c.expenseCreate);
  return r;
}
