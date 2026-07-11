export function parseContractDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (year && month && day) return new Date(year, month - 1, day);
  return new Date();
}

export function formatGregorianDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

export function arabicWeekday(date: Date): string {
  return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][date.getDay()];
}

export function formatFees(value: number): string {
  const rounded = Math.round(Number(value || 0));
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(rounded);
  return `${amount} ريال سعودي`;
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function triggerDownload(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
