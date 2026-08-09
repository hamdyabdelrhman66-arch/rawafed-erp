import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { FinanceService } from "../src/services/finance.service.js";
import { ReceivablesService } from "../src/services/receivables.service.js";
import { ReportService } from "../src/services/report.service.js";

class RollbackManualCustomer extends Error {}

describe("manual finance customer", () => {
  it("creates a child account with fees and supports normal invoice/payment posting", async () => {
    const observed = {
      type: "",
      workerType: "",
      workerPosition: "",
      grossFees: 0,
      feeItems: 0,
      invoices: 0,
      payments: 0,
      journals: 0,
      invoiceSubtotal: 0,
      invoiceRevenueCredit: 0,
      invoiceDebit: 0,
      invoiceCredit: 0,
      paymentCashDebit: 0,
      paymentReceivableCredit: 0,
      statementBalance: 0,
      customerOutstanding: 0,
      invoiceVisibleInFinance: false,
      paymentVisibleInFinanceReport: false,
      reportRevenueIncludesInvoice: false,
    };
    await expect(prisma.$transaction(async (tx) => {
      const nestedClient = new Proxy(tx as unknown as PrismaClient, {
        get(target, property, receiver) {
          if (property === "$transaction")
            return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
          return Reflect.get(target, property, receiver);
        },
      });
      const suffix = randomUUID().replace(/\D/g, "").padEnd(9, "7").slice(0, 9);
      const customer = await new ReceivablesService(nestedClient).createManualCustomer({
        customerType: "CHILD",
        nameAr: "طفل مالي تجريبي",
        nameEn: "Manual Finance Child",
        identityType: "NATIONAL_ID",
        nationalId: `1${suffix}`,
        nationality: "سعودي",
        phone: "0500000000",
        grade: "Grade 1",
        guardianName: "Test Guardian",
        fees: [{ name: "Manual Tuition", category: "TUITION", amount: 1000 }],
      }, {});
      const account = await tx.financeAccount.findUniqueOrThrow({
        where: { studentId: customer.studentId },
        include: { feeItems: true },
      });
      observed.type = customer.customerType;
      observed.grossFees = Number(account.expectedTotal);
      observed.feeItems = account.feeItems.length;

      const payment = await new FinanceService(nestedClient).createPayment({
        accountId: account.id,
        receiptNumber: `REC-MAN-${randomUUID().slice(0, 8)}`,
        amount: 250,
        method: "Cash",
        lines: [{ feeItem: "Manual Tuition", amount: 250 }],
      }, {});
      observed.invoices = await tx.financeInvoice.count({ where: { accountId: account.id } });
      observed.payments = await tx.financePayment.count({ where: { id: payment.payment.id } });
      observed.journals = await tx.journalEntry.count({
        where: { OR: [{ invoice: { accountId: account.id } }, { paymentId: payment.payment.id }] },
      });
      const invoice = await tx.financeInvoice.findFirstOrThrow({
        where: { accountId: account.id },
        include: { lines: { include: { revenueAccount: true } } },
      });
      const invoiceJournal = await tx.journalEntry.findFirstOrThrow({
        where: { invoiceId: invoice.id, sourceType: "finance_invoice" },
        include: { lines: { include: { account: true } } },
      });
      const paymentJournal = await tx.journalEntry.findFirstOrThrow({
        where: { paymentId: payment.payment.id, sourceType: "finance_payment" },
        include: { lines: { include: { account: true } } },
      });
      const refreshedCustomer = await new ReceivablesService(nestedClient).get(customer.id);
      const statement = await new ReceivablesService(nestedClient).statement(customer.id);
      const financeInvoices = await new FinanceService(nestedClient).invoices();
      const reportDay = String(payment.payment.paidAt).slice(0, 10);
      const financeReport = await new ReportService(nestedClient).finance(reportDay, reportDay);

      observed.invoiceSubtotal = Number(invoice.subtotal);
      observed.invoiceRevenueCredit = invoiceJournal.lines
        .filter((line) => line.account.type === "REVENUE")
        .reduce((sum, line) => sum + Number(line.credit), 0);
      observed.invoiceDebit = invoiceJournal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
      observed.invoiceCredit = invoiceJournal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
      observed.paymentCashDebit = paymentJournal.lines
        .filter((line) => line.account.isCashAccount)
        .reduce((sum, line) => sum + Number(line.debit), 0);
      observed.paymentReceivableCredit = paymentJournal.lines
        .filter((line) => line.account.isReceivableAccount)
        .reduce((sum, line) => sum + Number(line.credit), 0);
      observed.statementBalance = statement.closingBalance;
      observed.customerOutstanding = refreshedCustomer.summary.outstanding;
      observed.invoiceVisibleInFinance = financeInvoices.some((row: any) => row.id === invoice.id);
      observed.paymentVisibleInFinanceReport = financeReport.payments.some((row: any) => row.id === payment.payment.id);
      observed.reportRevenueIncludesInvoice = financeReport.revenue >= observed.invoiceRevenueCredit;

      const workerSuffix = randomUUID().replace(/\D/g, "").padEnd(9, "8").slice(0, 9);
      const worker = await new ReceivablesService(nestedClient).createManualCustomer({
        customerType: "WORKER",
        nameAr: "عامل مالي تجريبي",
        nameEn: "Manual Finance Worker",
        identityType: "NATIONAL_ID",
        nationalId: `1${workerSuffix}`,
        nationality: "سعودي",
        phone: "0500000001",
        position: "Driver",
        department: "Transportation",
        fees: [{ name: "Worker Service", category: "OTHER_SERVICES", amount: 500 }],
      }, {});
      observed.workerType = worker.customerType;
      observed.workerPosition = worker.position;
      throw new RollbackManualCustomer();
    }, { timeout: 120_000 })).rejects.toBeInstanceOf(RollbackManualCustomer);

    expect(observed.type).toBe("CHILD");
    expect(observed.workerType).toBe("WORKER");
    expect(observed.workerPosition).toBe("Driver");
    expect(observed.grossFees).toBe(1000);
    expect(observed.feeItems).toBe(1);
    expect(observed.invoices).toBe(1);
    expect(observed.payments).toBe(1);
    expect(observed.journals).toBe(2);
    expect(observed.invoiceSubtotal).toBe(1000);
    expect(observed.invoiceRevenueCredit).toBe(1000);
    expect(observed.invoiceDebit).toBe(1150);
    expect(observed.invoiceCredit).toBe(1150);
    expect(observed.paymentCashDebit).toBe(250);
    expect(observed.paymentReceivableCredit).toBe(250);
    expect(observed.statementBalance).toBe(750);
    expect(observed.customerOutstanding).toBe(750);
    expect(observed.invoiceVisibleInFinance).toBe(true);
    expect(observed.paymentVisibleInFinanceReport).toBe(true);
    expect(observed.reportRevenueIncludesInvoice).toBe(true);
  }, 120_000);
});
