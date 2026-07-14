import type { DatabaseClient } from "../repositories/repository.types.js";

export const money = (value: unknown) =>
  Math.round((Number(value) || 0) * 100) / 100;

export const isSaudiNationalId = (nationalId: unknown) =>
  String(nationalId || "").trim().startsWith("1");

export const vatRateForStudent = (nationalId: unknown) =>
  String(nationalId || "").trim()
    ? isSaudiNationalId(nationalId)
      ? 0
      : 15
    : 0;

export const vatForSubtotal = (subtotal: unknown, nationalId: unknown) =>
  money(money(subtotal) * (vatRateForStudent(nationalId) / 100));

export async function recalculateStudentVatUsing(
  tx: DatabaseClient,
  studentId: string,
  nationalId: unknown,
) {
  const account = await tx.financeAccount.findUnique({
    where: { studentId },
    include: {
      feeItems: true,
      payments: { where: { status: "COMPLETED", deletedAt: null } },
      invoices: {
        where: {
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          deletedAt: null,
        },
        include: {
          lines: true,
          payments: {
            where: { payment: { status: "COMPLETED", deletedAt: null } },
          },
          journalEntries: true,
        },
      },
    },
  });
  const customer = await tx.accountingCustomer.findUnique({
    where: { studentId },
  });
  if (customer)
    await tx.accountingCustomer.update({
      where: { id: customer.id },
      data: { nationalId: String(nationalId || "") || null },
    });
  if (!account || account.payments.length) return { recalculated: false };

  const categorized = account.feeItems.some((item: any) => item.serviceCategory !== "LEGACY_COMBINED");
  const subtotal = money(account.feeItems
    .filter((item: any) => item.name.toUpperCase() !== "VAT")
    .reduce((sum: number, item: any) => sum + Number(categorized ? (item.subtotal ?? item.amount) : item.amount), 0));
  let vat = vatForSubtotal(subtotal, nationalId);
  if (categorized) {
    const mappings = await tx.revenueCategoryMapping.findMany({ where: { active: true } });
    let mappedVat = 0;
    for (const item of account.feeItems) {
      const itemSubtotal = money(item.subtotal ?? item.amount);
      const mapping = mappings.find((row) => row.category === item.serviceCategory);
      const itemVat = mapping && mapping.taxTreatment !== "STANDARD" ? 0 : vatForSubtotal(itemSubtotal, nationalId);
      mappedVat = money(mappedVat + itemVat);
      await tx.financeAccountFeeItem.update({ where: { id: item.id }, data: { subtotal: itemSubtotal, vatAmount: itemVat, amount: money(itemSubtotal + itemVat) } });
    }
    vat = mappedVat;
  } else {
    await tx.financeAccountFeeItem.deleteMany({ where: { accountId: account.id, name: "VAT" } });
    if (vat) await tx.financeAccountFeeItem.create({ data: { accountId: account.id, name: "VAT", amount: vat } });
  }
  await tx.financeAccount.update({ where: { id: account.id }, data: { expectedTotal: money(subtotal + vat) } });

  const vatAccount = await tx.chartOfAccount.findUnique({
    where: { systemKey: "vat-payable" },
  });
  const revenue = await tx.chartOfAccount.findUnique({
    where: { systemKey: "tuition-revenue" },
  });

  for (const invoice of account.invoices) {
    if (invoice.payments.length) continue;
    const invoiceSubtotal = money(invoice.subtotal);
    const mapping = invoice.serviceCategory !== "LEGACY_COMBINED"
      ? await tx.revenueCategoryMapping.findUnique({ where: { category: invoice.serviceCategory } })
      : null;
    const invoiceVat = mapping && mapping.taxTreatment !== "STANDARD" ? 0 : vatForSubtotal(invoiceSubtotal, nationalId);
    const invoiceTotal = money(invoiceSubtotal + invoiceVat);
    if (!customer || !revenue || (invoiceVat && !vatAccount))
      throw new Error("Required VAT recalculation accounts are not configured.");
    await tx.financeInvoice.update({
      where: { id: invoice.id },
      data: { vatAmount: invoiceVat, total: invoiceTotal },
    });
    for (const line of invoice.lines) {
      const lineVat = vatForSubtotal(line.netAmount, nationalId);
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          vatRate: vatRateForStudent(nationalId),
          vatAmount: lineVat,
          totalAmount: money(Number(line.netAmount) + lineVat),
        },
      });
    }
    for (const journal of invoice.journalEntries) {
      await tx.journalLine.deleteMany({ where: { journalEntryId: journal.id } });
      await tx.journalLine.createMany({
        data: [
          {
            journalEntryId: journal.id,
            accountId: customer.receivableAccountId,
            debit: invoiceTotal,
          },
          {
            journalEntryId: journal.id,
            accountId: invoice.lines[0]?.revenueAccountId || revenue.id,
            credit: invoiceSubtotal,
          },
          ...(invoiceVat && vatAccount
            ? [
                {
                  journalEntryId: journal.id,
                  accountId: vatAccount.id,
                  credit: invoiceVat,
                },
              ]
            : []),
        ],
      });
    }
  }
  return { recalculated: true, subtotal, vat, total: money(subtotal + vat) };
}
