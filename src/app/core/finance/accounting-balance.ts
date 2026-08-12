export type AccountingBalanceSide = 'DEBIT' | 'CREDIT' | 'ZERO';

export interface AccountingBalancePresentation {
  signedAmount: number;
  amount: number;
  side: AccountingBalanceSide;
}

export function accountingBalancePresentation(value: unknown): AccountingBalancePresentation {
  const signedAmount = Math.round(Number(value || 0) * 100) / 100;
  return {
    signedAmount,
    amount: Math.abs(signedAmount),
    side: signedAmount > 0 ? 'DEBIT' : signedAmount < 0 ? 'CREDIT' : 'ZERO',
  };
}

export function formatAccountingBalance(value: unknown, locale: 'ar' | 'en' = 'ar'): string {
  const balance = accountingBalancePresentation(value);
  const amount = balance.amount.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: balance.amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  if (balance.side === 'ZERO') return locale === 'ar' ? '0 ر.س' : 'SAR 0';
  const side = locale === 'ar'
    ? balance.side === 'DEBIT' ? 'مدين' : 'دائن'
    : balance.side === 'DEBIT' ? 'Dr' : 'Cr';
  return locale === 'ar' ? `${amount} ر.س ${side}` : `SAR ${amount} ${side}`;
}
