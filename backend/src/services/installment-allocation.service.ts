import type { DatabaseClient } from "../repositories/repository.types.js";

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

async function applyInstallmentTotal(
  tx: DatabaseClient,
  customerId: string,
  paymentAmount: number,
  selectedInstallmentId?: string | null,
): Promise<void> {
  let remaining = money(paymentAmount);
  if (remaining <= 0) return;
  const installments = await tx.installment.findMany({
    where: {
      customerId,
      plan: { active: true, deletedAt: null },
      status: { not: "paid" },
      ...(selectedInstallmentId ? { id: selectedInstallmentId } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  for (const installment of installments) {
    if (remaining <= 0) break;
    const outstanding = money(Number(installment.amount) - Number(installment.paidAmount));
    const allocated = Math.min(outstanding, remaining);
    const paidAmount = money(Number(installment.paidAmount) + allocated);
    await tx.installment.update({
      where: { id: installment.id },
      data: { paidAmount, status: paidAmount >= Number(installment.amount) ? "paid" : "partial" },
    });
    remaining = money(remaining - allocated);
  }
}

export async function reconcileInstallmentPayments(
  tx: DatabaseClient,
  customerId: string,
): Promise<void> {
  const customer = await tx.accountingCustomer.findUnique({
    where: { id: customerId },
    select: { registrationId: true },
  });
  if (!customer) return;
  const [financePayments, customerPayments] = await Promise.all([
    customer.registrationId
      ? tx.financePayment.aggregate({
          where: {
            registrationId: customer.registrationId,
            status: "COMPLETED",
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    tx.customerPayment.aggregate({
      where: { customerId, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);
  await tx.installment.updateMany({
    where: { customerId, plan: { active: true, deletedAt: null } },
    data: { paidAmount: 0, status: "unpaid" },
  });
  const linkedPayments = await tx.financePayment.findMany({
    where: {
      registrationId: customer.registrationId || undefined,
      status: "COMPLETED",
      deletedAt: null,
      installmentId: { not: null },
    },
    select: { amount: true, installmentId: true },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
  for (const payment of linkedPayments)
    await applyInstallmentTotal(tx, customerId, money(payment.amount), payment.installmentId);
  const linkedTotal = linkedPayments.reduce((sum, payment) => money(sum + money(payment.amount)), 0);
  await applyInstallmentTotal(
    tx,
    customerId,
    money(financePayments._sum.amount) - linkedTotal + money(customerPayments._sum.amount),
  );
}

export async function allocateInstallmentPayment(
  tx: DatabaseClient,
  customerId: string,
  _paymentAmount?: number,
  _selectedInstallmentId?: string,
): Promise<void> {
  await reconcileInstallmentPayments(tx, customerId);
}

export const installmentStatus = (installment: any, now = new Date()) => {
  if (Number(installment.paidAmount) >= Number(installment.amount)) return "paid";
  const grace = Number(installment.plan?.gracePeriodDays || 0);
  const overdueAt = new Date(installment.dueDate);
  overdueAt.setUTCDate(overdueAt.getUTCDate() + grace + 1);
  if (now >= overdueAt) return Number(installment.paidAmount) > 0 ? "partial_overdue" : "overdue";
  return Number(installment.paidAmount) > 0 ? "partial" : "unpaid";
};
