import { randomUUID } from 'node:crypto';
import { DatabaseShape, FinanceAccount } from './types.js';

export function ensureFinanceAccount(db: DatabaseShape, registration: any): FinanceAccount {
  const existing = db.financeAccounts.find((item) => item.registrationId === registration.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const financial = registration.financial || {};
  const feeItems = [
    ['Registration Fee', financial.registrationFee],
    ['Tuition', financial.tuition],
    ['Books', financial.books],
    ['Uniform', financial.uniform],
    ['Activities', financial.activities],
    ['Bus Transportation', financial.transportationRequired ? financial.transportationFee : 0]
  ]
    .map(([name, amount]) => ({ name: String(name), amount: money(amount) }))
    .filter((item) => item.amount > 0);
  const subtotal = feeItems.reduce((sum, item) => money(sum + item.amount), 0);
  const expectedTotal = isVatExemptRegistration(registration) ? subtotal : money(financial.grandTotal || subtotal);

  const account: FinanceAccount = {
    id: randomUUID(),
    registrationId: registration.id,
    registrationNumber: registration.registrationNumber || '',
    studentName: registration.student?.englishName || registration.student?.arabicName || registration.registrationNumber || 'Student',
    grade: registration.student?.applyingGrade || '',
    expectedTotal,
    paid: 0,
    remaining: expectedTotal,
    status: 'unpaid',
    feeItems,
    createdAt: now,
    updatedAt: now
  };

  db.financeAccounts.unshift(account);
  db.notifications.unshift({
    id: randomUUID(),
    message: `Finance account created for ${account.studentName}. Expected total: ${expectedTotal.toLocaleString('en-US')} SAR`,
    targetRoles: ['Finance', 'Super Admin'],
    category: 'finance',
    createdAt: now,
    readBy: [],
    link: '/finance/patient-packages',
    sourceId: `finance-account:${account.id}`
  });

  return account;
}

export function applyPaymentToAccount(account: FinanceAccount, amount: number): void {
  account.paid = money(account.paid + amount);
  account.remaining = money(Math.max(account.expectedTotal - account.paid, 0));
  account.status = account.remaining <= 0 ? 'paid' : account.paid > 0 ? 'partial' : 'unpaid';
  account.updatedAt = new Date().toISOString();
}

export function money(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round((numberValue + Number.EPSILON) * 100) / 100 : 0;
}

export function isVatExemptRegistration(registration: any): boolean {
  const nationalId = String(registration?.student?.nationalId || registration?.nationalId || '').replace(/\D/g, '');
  return nationalId.startsWith('1');
}
