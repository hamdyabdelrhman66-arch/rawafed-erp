export interface OutstandingFeeItem {
  feeItem: string;
  expected: number;
}

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

export function allocateRemaining(items: OutstandingFeeItem[]): number[] {
  return items.map((item) => money(Math.max(item.expected, 0)));
}

export function allocateHalf(items: OutstandingFeeItem[]): number[] {
  const eligible = items.filter((item) => item.expected > 0);
  const total = money(eligible.reduce((sum, item) => sum + item.expected, 0));
  const target = money(total / 2);
  let allocated = 0;
  return items.map((item) => {
    if (item.expected <= 0 || total <= 0) return 0;
    const isLast = item === eligible[eligible.length - 1];
    const value = isLast
      ? money(target - allocated)
      : money((target * item.expected) / total);
    const bounded = money(Math.min(item.expected, Math.max(value, 0)));
    allocated = money(allocated + bounded);
    return bounded;
  });
}
