import type { Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { asyncController } from "./core.controller.js";
import { AccountService } from "../services/account.service.js";
import { CashBankService } from "../services/cash-bank.service.js";
import { FinancialStatementsService } from "../services/financial-statements.service.js";
import { JournalService } from "../services/journal.service.js";
import { PayablesService } from "../services/payables.service.js";
import { ReceivablesService } from "../services/receivables.service.js";
import { ReconciliationService } from "../services/reconciliation.service.js";
import { VatService } from "../services/vat.service.js";
import { AccountingExpenseService } from "../services/accounting-expense.service.js";
import { AuditRepository } from "../repositories/audit.repository.js";

const actor = (r: AuthRequest) => ({
  id: r.user?.id,
  displayName: r.user?.displayName,
  role: r.user?.role,
});
export class AccountingController {
  private prisma;
  private accounts;
  private journalService;
  private statements;
  private receivables;
  private payables;
  private cash;
  private vat;
  private reconciliation;
  private expenses;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.accounts = new AccountService(prisma);
    this.journalService = new JournalService(prisma);
    this.statements = new FinancialStatementsService(prisma);
    this.receivables = new ReceivablesService(prisma);
    this.payables = new PayablesService(prisma);
    this.cash = new CashBankService(prisma);
    this.vat = new VatService(prisma);
    this.reconciliation = new ReconciliationService(prisma);
    this.expenses = new AccountingExpenseService(prisma);
  }
  listAccounts = asyncController(async (req, res) =>
    res.json(
      await this.accounts.list(
        req.query.type
          ? [String(req.query.type).toUpperCase() as any]
          : undefined,
      ),
    ),
  );
  accountDetails = asyncController(async (req, res) =>
    res.json(await this.accounts.details(req.params.id)),
  );
  createAccount = asyncController(async (req, res) =>
    res.status(201).json(await this.accounts.create(req.body, actor(req))),
  );
  updateAccount = asyncController(async (req, res) =>
    res.json(await this.accounts.update(req.params.id, req.body, actor(req))),
  );
  archiveAccount = asyncController(async (req, res) =>
    res.json(await this.accounts.archive(req.params.id)),
  );
  moveAccount = asyncController(async (req, res) =>
    res.json(
      await this.accounts.move(req.params.id, req.body.parentId || null),
    ),
  );
  suggestCode = asyncController(async (req, res) =>
    res.json(
      await this.accounts.suggest(
        String(req.query.parentId || ""),
        String(req.query.type || "asset"),
      ),
    ),
  );
  costCenters = asyncController(async (_req, res) =>
    res.json(await this.accounts.costCenters()),
  );
  expenseAccounts = asyncController(async (_req, res) =>
    res.json(await this.accounts.expenseAccounts()),
  );
  paymentAccounts = asyncController(async (_req, res) =>
    res.json(await this.accounts.paymentAccounts()),
  );
  revenueAccounts = asyncController(async (_req, res) =>
    res.json(await this.accounts.revenueAccounts()),
  );
  receivableAccounts = asyncController(async (_req, res) =>
    res.json(await this.accounts.receivableAccounts()),
  );
  payableAccounts = asyncController(async (_req, res) =>
    res.json(await this.accounts.payableAccounts()),
  );
  journals = asyncController(async (req, res) =>
    res.json(
      await this.journalService.list(
        Number(req.query.offset || 0),
        Number(req.query.limit || 100),
      ),
    ),
  );
  journalSummary = asyncController(async (_req, res) =>
    res.json(await this.journalService.summary()),
  );
  journalDetails = asyncController(async (req, res) =>
    res.json(await this.journalService.details(req.params.id)),
  );
  createJournal = asyncController(async (req, res) =>
    res.status(201).json(await this.journalService.post(req.body, actor(req))),
  );
  updateJournal = asyncController(async (req, res) =>
    res.json(
      await this.journalService.updateManual(
        req.params.id,
        req.body,
        actor(req),
      ),
    ),
  );
  deleteJournal = asyncController(async (req, res) => {
    await this.journalService.deleteManual(req.params.id, actor(req));
    res.status(204).send();
  });
  reverseJournal = asyncController(async (req, res) =>
    res
      .status(201)
      .json(await this.journalService.reverse(req.params.id, actor(req))),
  );
  transitionJournal = asyncController(async (req, res) =>
    res.json(await this.journalService.transition(req.params.id, req.path.split("/").pop() as any, actor(req))),
  );
  correctJournal = asyncController(async (req, res) =>
    res.status(201).json(await this.journalService.correctPosted(req.params.id, req.body.entry, req.body.reason, Boolean(req.body.accountingOnly), actor(req))),
  );
  accountingPeriods = asyncController(async (req, res) =>
    res.json(await this.prisma.accountingPeriod.findMany({ where: { branchId: req.query.branchId ? String(req.query.branchId) : undefined }, include: { branch: true }, orderBy: { startsAt: "desc" } })),
  );
  updateAccountingPeriod = asyncController(async (req, res) => {
    const previous = await this.prisma.accountingPeriod.findUnique({ where: { id: req.params.id } });
    if (!previous) return res.status(404).json({ message: "Accounting period not found." });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.accountingPeriod.update({ where: { id: req.params.id }, data: { status: req.body.status, notes: req.body.notes, closedAt: req.body.status === "OPEN" ? null : new Date(), closedById: req.body.status === "OPEN" ? null : req.user?.id } });
      await new AuditRepository(tx).create({ actorId: req.user?.id, actorRole: req.user?.role, action: "change accounting period", entityType: "accounting_period", entityId: row.id, riskLevel: "HIGH", oldValues: { status: previous.status, notes: previous.notes }, newValues: { status: row.status, notes: row.notes }, changedFields: ["status", "notes"] });
      return row;
    });
    res.json(updated);
  });
  ledger = asyncController(async (req, res) =>
    res.json(
      await this.statements.ledger(
        req.params.accountId,
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  trialBalance = asyncController(async (req, res) =>
    res.json(
      await this.statements.trialBalance(
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  dashboard = asyncController(async (req, res) =>
    res.json(
      await this.statements.dashboard(
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  incomeStatement = asyncController(async (req, res) =>
    res.json(
      await this.statements.incomeStatement(
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  balanceSheet = asyncController(async (req, res) =>
    res.json(await this.statements.balanceSheet(String(req.query.to || ""))),
  );
  cashFlow = asyncController(async (req, res) =>
    res.json(
      await this.statements.cashFlow(
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  customers = asyncController(async (_req, res) =>
    res.json(await this.receivables.list()),
  );
  customer = asyncController(async (req, res) =>
    res.json(await this.receivables.get(req.params.id)),
  );
  customerStatement = asyncController(async (req, res) =>
    res.json(
      await this.receivables.statement(
        req.params.id,
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  installments = asyncController(async (req, res) =>
    res.json(await this.receivables.installments(req.params.id)),
  );
  createPlan = asyncController(async (req, res) =>
    res
      .status(201)
      .json(await this.receivables.createPlan(req.params.id, req.body, actor(req))),
  );
  customerPayment = asyncController(async (req, res) =>
    res.status(201).json(await this.receivables.payment(req.body, actor(req))),
  );
  suppliers = asyncController(async (_req, res) =>
    res.json(await this.payables.list()),
  );
  supplier = asyncController(async (req, res) =>
    res.json(await this.payables.get(req.params.id)),
  );
  createSupplier = asyncController(async (req, res) =>
    res.status(201).json(await this.payables.create(req.body)),
  );
  updateSupplier = asyncController(async (req, res) =>
    res.json(await this.payables.update(req.params.id, req.body)),
  );
  supplierStatement = asyncController(async (req, res) =>
    res.json(
      await this.payables.statement(
        req.params.id,
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  supplierPayment = asyncController(async (req, res) =>
    res.status(201).json(await this.payables.payment(req.body, actor(req))),
  );
  archiveSupplier = asyncController(async (req, res) => {
    await this.payables.archive(req.params.id);
    res.status(204).send();
  });
  supplierAging = asyncController(async (_req, res) =>
    res.json(await this.payables.aging()),
  );
  cashboxes = asyncController(async (_req, res) =>
    res.json(await this.cash.cashboxes()),
  );
  banks = asyncController(async (_req, res) =>
    res.json(await this.cash.banks()),
  );
  createCashbox = asyncController(async (req, res) =>
    res.status(201).json(await this.cash.createCashbox(req.body)),
  );
  createBank = asyncController(async (req, res) =>
    res.status(201).json(await this.cash.createBank(req.body)),
  );
  updateCashbox = asyncController(async (req, res) =>
    res.json(await this.cash.updateCashbox(req.params.id, req.body)),
  );
  updateBank = asyncController(async (req, res) =>
    res.json(await this.cash.updateBank(req.params.id, req.body)),
  );
  transfer = asyncController(async (req, res) =>
    res.status(201).json(await this.cash.transfer(req.body, actor(req))),
  );
  vatSummary = asyncController(async (req, res) =>
    res.json(
      await this.vat.summary(
        String(req.query.from || ""),
        String(req.query.to || ""),
      ),
    ),
  );
  reconcile = asyncController(async (_req, res) =>
    res.json(await this.reconciliation.report()),
  );
  search = asyncController(async (req, res) =>
    res.json(await this.statements.search(String(req.query.q || ""))),
  );
  expenseList = asyncController(async (_req, res) =>
    res.json(await this.expenses.list()),
  );
  expenseGet = asyncController(async (req, res) =>
    res.json(await this.expenses.get(req.params.id)),
  );
  expenseCreate = asyncController(async (req, res) =>
    res.status(201).json(await this.expenses.create(req.body, actor(req))),
  );
  expensePay = asyncController(async (req, res) =>
    res.status(201).json(await this.expenses.pay(req.params.id, req.body, actor(req))),
  );
}
