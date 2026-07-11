import { Injectable } from '@angular/core';

export interface ZatcaInvoiceInput {
  sellerName?: string;
  taxNumber?: string;
  date: string;
  total: number;
  vat: number;
}

@Injectable({ providedIn: 'root' })
export class ZatcaInvoiceService {
  readonly sellerName = '\u0645\u062f\u0627\u0631\u0633 \u0631\u0648\u0627\u0641\u062f \u0627\u0644\u0639\u0627\u0644\u0645\u064a\u0629';
  readonly taxNumber = '312087629900003';
  readonly vatRate = 0.15;

  fromVatInclusive(total: number): { amountBeforeVat: number; vat: number; total: number } {
    const safeTotal = this.roundMoney(total);
    const amountBeforeVat = this.roundMoney(safeTotal / (1 + this.vatRate));
    const vat = this.roundMoney(safeTotal - amountBeforeVat);
    return { amountBeforeVat, vat, total: safeTotal };
  }

  fromAmountBeforeVat(amountBeforeVat: number): { amountBeforeVat: number; vat: number; total: number } {
    const safeAmount = this.roundMoney(amountBeforeVat);
    const vat = this.roundMoney(safeAmount * this.vatRate);
    return { amountBeforeVat: safeAmount, vat, total: this.roundMoney(safeAmount + vat) };
  }

  qrData(input: ZatcaInvoiceInput): string {
    const records = [
      this.tlv(1, input.sellerName || this.sellerName),
      this.tlv(2, input.taxNumber || this.taxNumber),
      this.tlv(3, this.invoiceDateTime(input.date)),
      this.tlv(4, this.money(input.total)),
      this.tlv(5, this.money(input.vat))
    ];

    const bytes = new Uint8Array(records.reduce((sum, record) => sum + record.length, 0));
    let offset = 0;
    records.forEach((record) => {
      bytes.set(record, offset);
      offset += record.length;
    });

    return this.base64(bytes);
  }

  invoiceDateTime(value: string): string {
    if (value?.includes('T')) return value;
    const date = value || new Date().toISOString().slice(0, 10);
    return `${date}T12:00:00Z`;
  }

  money(value: number): string {
    return this.roundMoney(value).toFixed(2);
  }

  private tlv(tag: number, value: string): Uint8Array {
    const valueBytes = new TextEncoder().encode(value || '');
    if (valueBytes.length > 255) {
      throw new Error(`ZATCA QR field ${tag} is too long.`);
    }

    const record = new Uint8Array(valueBytes.length + 2);
    record[0] = tag;
    record[1] = valueBytes.length;
    record.set(valueBytes, 2);
    return record;
  }

  private base64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  private roundMoney(value: number): number {
    const numberValue = Number(value);
    const safeValue = Number.isFinite(numberValue) ? numberValue : 0;
    return Math.round((safeValue + Number.EPSILON) * 100) / 100;
  }
}
