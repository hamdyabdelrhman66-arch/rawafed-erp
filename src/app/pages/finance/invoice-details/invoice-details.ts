import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { InvoiceTemplate } from '../invoice-template/invoice-template';

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
    private readonly zatcaInvoice: ZatcaInvoiceService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.invoicesService.getInvoice(id).subscribe((foundInvoice: any) => {
      if (!foundInvoice) return;

      this.invoice = this.mapInvoice(foundInvoice);
      this.qrData = this.zatcaInvoice.qrData({
        taxNumber: this.invoice.taxNumber,
        date: this.invoice.date,
        total: this.invoice.total,
        vat: this.invoice.vat
      });
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
      insuranceAmount: this.toNumber(this.firstValue(foundInvoice, 'insuranceAmount'), 0)
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
