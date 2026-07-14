import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { InvoiceTemplate } from '../invoice-template/invoice-template';
import { firstValueFrom } from 'rxjs';

interface InvoiceTemplateData {
  no: string;
  patient: string;
  service: string;
  amount: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  remaining: number;
  date: string;
  status: string;
  paymentMethod: string;
  count: number;
  taxNumber: string;
  doctor: string;
  clinic: string;
  insuranceCompany: string;
  patientId: string;
  fileNo: string;
  notes: string;
  user: string;
  insuranceAmount: number;
  vatExempt: boolean;
  lines: Array<{ invoiceNumber: string; category: string; service: string; amount: number; discount: number; vat: number; total: number }>;
}

@Component({
  selector: 'app-invoice-details',
  standalone: true,
  imports: [CommonModule, InvoiceTemplate],
  templateUrl: './invoice-details.html',
  styleUrls: ['./invoice-details.css', '../../../shared/finance/finance-ui.scss']
})
export class InvoiceDetails implements OnInit {
  @ViewChild(InvoiceTemplate) invoiceTemplate?: InvoiceTemplate;

  invoice: InvoiceTemplateData | null = null;
  qrData = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly zatcaInvoice: ZatcaInvoiceService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const receipt = this.route.snapshot.queryParamMap.get('receipt');
    const [foundInvoice, payments] = await Promise.all([
      firstValueFrom(this.invoicesService.getInvoice(id)),
      receipt ? firstValueFrom(this.paymentsService.getPayments()) : Promise.resolve([])
    ]);
    if (!foundInvoice) return;

    const baseInvoice = this.mapInvoice(foundInvoice);
    const payment = receipt ? payments.find((item: any) => item.receipt === receipt) : null;
    this.invoice = payment ? this.mapPaymentReceipt(baseInvoice, payment) : baseInvoice;
    this.qrData = this.zatcaInvoice.qrData({
      taxNumber: this.invoice.taxNumber,
      date: this.invoice.date,
      total: this.invoice.total,
      vat: this.invoice.vat
    });
  }

  downloadPdf(): void {
    void this.invoiceTemplate?.downloadPdf();
  }

  private mapInvoice(foundInvoice: any): InvoiceTemplateData {
    const rawAmount = this.toNumber(this.firstValue(foundInvoice, 'amount', 'amountBeforeVat', 'subtotal'));
    const rawPaid = this.toNumber(this.firstValue(foundInvoice, 'paid', 'paidAmount'));
    const hasStoredTotal = this.hasValue(foundInvoice, 'total', 'totalAmount');
    const hasStoredVat = this.hasValue(foundInvoice, 'vat', 'vatAmount', 'taxAmount');
    const legacyPaymentInvoice = !hasStoredTotal && !hasStoredVat && this.isPaid(foundInvoice.status) && rawPaid > 0 && rawPaid === rawAmount;
    const legacyInclusiveTotals = legacyPaymentInvoice ? this.zatcaInvoice.fromVatInclusive(rawPaid) : null;
    const amount = legacyInclusiveTotals?.amountBeforeVat ?? rawAmount;
    const discount = this.toNumber(this.firstValue(foundInvoice, 'discount'));
    const taxableAmount = Math.max(amount - discount, 0);
    const calculated = this.zatcaInvoice.fromAmountBeforeVat(taxableAmount);
    const vat = legacyInclusiveTotals?.vat ?? this.toNumber(this.firstValue(foundInvoice, 'vat', 'vatAmount', 'taxAmount'), calculated.vat);
    const total = legacyInclusiveTotals?.total ?? this.toNumber(this.firstValue(foundInvoice, 'total', 'totalAmount'), this.roundMoney(taxableAmount + vat));
    const paid = this.toNumber(this.firstValue(foundInvoice, 'paid', 'paidAmount'), this.isPaid(foundInvoice.status) ? total : 0);
    const remaining = this.toNumber(this.firstValue(foundInvoice, 'remaining', 'remainingAmount'), this.roundMoney(Math.max(total - paid, 0)));
    const vatExempt = Boolean(foundInvoice?.vatExempt) || vat <= 0;

    return {
      no: this.toText(this.firstValue(foundInvoice, 'no', 'invoiceNumber', 'invoiceNo', 'id')),
      patient: this.toText(this.firstValue(foundInvoice, 'patient', 'patientName')),
      service: this.toText(this.firstValue(foundInvoice, 'service', 'serviceName', 'feeItem')),
      amount,
      discount,
      vat,
      total,
      paid,
      remaining,
      date: this.toText(this.firstValue(foundInvoice, 'date', 'invoiceDate'), new Date().toISOString()),
      status: this.toText(this.firstValue(foundInvoice, 'status'), 'Pending'),
      paymentMethod: this.toText(this.firstValue(foundInvoice, 'paymentMethod', 'method'), 'Cash'),
      count: this.toNumber(this.firstValue(foundInvoice, 'count', 'quantity'), 1),
      taxNumber: this.toText(this.firstValue(foundInvoice, 'taxNumber', 'vatNumber'), this.zatcaInvoice.taxNumber),
      doctor: this.toText(this.firstValue(foundInvoice, 'doctor', 'doctorName')),
      clinic: this.toText(this.firstValue(foundInvoice, 'clinic'), 'مدرسة روافد الشرق الأوسط العالمية'),
      insuranceCompany: this.toText(this.firstValue(foundInvoice, 'insuranceCompany', 'companyName'), 'Parent / Student'),
      patientId: this.toText(this.firstValue(foundInvoice, 'patientId', 'nationalId', 'registrationNumber')),
      fileNo: this.toText(this.firstValue(foundInvoice, 'fileNo', 'fileNumber', 'registrationNumber')),
      notes: this.toText(this.firstValue(foundInvoice, 'notes')),
      user: this.toText(this.firstValue(foundInvoice, 'user', 'createdBy'), 'Finance'),
      insuranceAmount: this.toNumber(this.firstValue(foundInvoice, 'insuranceAmount'), 0),
      vatExempt,
      lines: [{
        invoiceNumber: this.toText(this.firstValue(foundInvoice, 'no', 'invoiceNumber', 'invoiceNo', 'id')),
        category: this.toText(this.firstValue(foundInvoice, 'categoryLabel', 'category'), foundInvoice?.legacyCombined ? 'Legacy Combined Invoice' : 'School Fees'),
        service: this.toText(this.firstValue(foundInvoice, 'service', 'serviceName', 'feeItem')),
        amount,
        discount,
        vat,
        total,
      }]
    };
  }

  private mapPaymentReceipt(base: InvoiceTemplateData, payment: any): InvoiceTemplateData {
    const total = this.roundMoney(this.toNumber(payment.amount));
    const vatExempt = Boolean(payment.vatExempt) || base.vatExempt;
    const tax = vatExempt
      ? { amountBeforeVat: total, vat: 0, total }
      : this.zatcaInvoice.fromVatInclusive(total);
    const service = Array.isArray(payment.feeItems) && payment.feeItems.length
      ? payment.feeItems.map((item: any) => item.name).join(' + ')
      : this.toText(payment.feeItem || payment.package, base.service);

    const lines = Array.isArray(payment.invoices) && payment.invoices.length
      ? payment.invoices.map((invoice: any) => {
          const lineTotal = this.roundMoney(this.toNumber(invoice.amount));
          const lineVat = vatExempt || !this.toNumber(invoice.total)
            ? 0
            : this.roundMoney(lineTotal * this.toNumber(invoice.vat) / this.toNumber(invoice.total));
          return {
            invoiceNumber: this.toText(invoice.invoiceNumber, invoice.invoiceId),
            category: this.toText(invoice.categoryLabel, invoice.category),
            service: this.toText(invoice.categoryLabel, service),
            amount: this.roundMoney(lineTotal - lineVat),
            discount: 0,
            vat: lineVat,
            total: lineTotal,
          };
        })
      : [{ invoiceNumber: this.toText(payment.receipt, base.no), category: service, service, amount: tax.amountBeforeVat, discount: 0, vat: tax.vat, total: tax.total }];

    return {
      ...base,
      no: this.toText(payment.receipt, base.no),
      service,
      amount: tax.amountBeforeVat,
      discount: 0,
      vat: tax.vat,
      total: tax.total,
      paid: tax.total,
      remaining: 0,
      date: this.toText(payment.date, base.date),
      status: 'Paid',
      paymentMethod: this.toText(payment.method, base.paymentMethod),
      notes: this.toText(payment.notes, base.notes),
      user: this.toText(payment.collectedBy, base.user),
      patientId: this.toText(payment.nationalId, base.patientId),
      vatExempt,
      lines
    };
  }

  private toNumber(value: unknown, fallback = 0): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  private toText(value: unknown, fallback = ''): string {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  }

  private firstValue(source: any, ...keys: string[]): unknown {
    return keys
      .map((key) => source?.[key])
      .find((value) => value !== null && value !== undefined && value !== '');
  }

  private hasValue(source: any, ...keys: string[]): boolean {
    return keys.some((key) => source?.[key] !== null && source?.[key] !== undefined && source?.[key] !== '');
  }

  private isPaid(status: unknown): boolean {
    return this.toText(status).toLowerCase() === 'paid';
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
