import { randomUUID } from 'node:crypto';
export function ensureFinanceAccount(db, registration) {
    const existing = db.financeAccounts.find((item) => item.registrationId === registration.id);
    if (existing)
        return existing;
    const now = new Date().toISOString();
    const financial = registration.financial || {};
    const expectedTotal = money(financial.grandTotal);
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
    const account = {
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
export function applyPaymentToAccount(account, amount) {
    account.paid = money(account.paid + amount);
    account.remaining = money(Math.max(account.expectedTotal - account.paid, 0));
    account.status = account.remaining <= 0 ? 'paid' : account.paid > 0 ? 'partial' : 'unpaid';
    account.updatedAt = new Date().toISOString();
}
export function money(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Math.round((numberValue + Number.EPSILON) * 100) / 100 : 0;
}
