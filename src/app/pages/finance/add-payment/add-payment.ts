import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { ZatcaInvoiceService } from '../../../core/finance/zatca-invoice.service';
import { StorageService } from '../../../core/services/storage.service';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

interface PaymentLine {
  feeItem: string;
  expected: number;
  amount: number;
}

@Component({
  selector: 'app-add-payment',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: './add-payment.html',
  styleUrls: ['./add-payment.css', '../../../shared/finance/finance-ui.scss']
})
export class AddPayment implements OnInit {
  accounts: any[] = [];
  selectedAccount: any = null;
  paymentMethod = 'Cash';
  paymentDate = new Date().toISOString().split('T')[0];
  collectedBy = 'Finance';
  referenceNumber = '';
  notes = '';
  previousPayments: any[] = [];
  paymentLines: PaymentLine[] = [];
  readonly accountLabel = (account: any) =>
    account
      ? `${account.patient} - ${account.registrationNumber || account.fileNo || '-'} - Grade ${account.grade || '-'} - Remaining ${Number(account.remaining || 0).toLocaleString('en-US')} SAR`
      : '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly accountService: PatientPackagesService,
    private readonly paymentsService: PaymentsService,
    private readonly invoicesService: InvoicesService,
    private readonly zatcaInvoice: ZatcaInvoiceService,
    private readonly storage: StorageService
  ) {}

  ngOnInit(): void {
    this.accountService.getPackages().subscribe((accounts: any[]) => {
      this.accounts = accounts;
      const accountId = Number(this.route.snapshot.queryParamMap.get('accountId'));
      this.selectedAccount = accountId ? this.accounts.find((item) => item.id === accountId) || null : null;
      if (this.selectedAccount) this.onAccountChange();
    });
  }

  get outstanding(): number {
    return Number(this.selectedAccount?.remaining || 0);
  }

  get outstandingAfterPayment(): number {
    return Math.max(this.outstanding - this.totalPaymentAmount, 0);
  }

  get totalPaymentAmount(): number {
    return this.paymentLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  }

  onAccountChange(): void {
    this.paymentLines = this.buildPaymentLines();
    this.loadPreviousPayments();
  }

  selectAccount(account: any): void {
    this.selectedAccount = account;
    this.onAccountChange();
  }

  payHalf(): void {
    this.allocateAmount(this.outstanding / 2);
  }

  payRemaining(): void {
    this.allocateAmount(this.outstanding);
  }

  clearPaymentLines(): void {
    this.paymentLines = this.paymentLines.map((line) => ({ ...line, amount: 0 }));
  }

  savePayment(): void {
    const payableLines = this.paymentLines
      .map((line) => ({ ...line, amount: Number(line.amount || 0) }))
      .filter((line) => line.amount > 0);

    if (!this.selectedAccount || !payableLines.length) {
      alert('Please select student account and enter at least one payment amount.');
      return;
    }

    const amount = this.totalPaymentAmount;
    if (amount > this.outstanding) {
      alert('Payment amount cannot be more than the remaining balance.');
      return;
    }

    const receiptBatchId = Date.now();
    const receiptNumber = `REC-${receiptBatchId}`;
    const studentName = this.selectedAccount.patient;

    payableLines.forEach((line, index) => {
      const paymentId = receiptBatchId + index;
      this.paymentsService.addPayment({
        id: paymentId,
        receipt: receiptNumber,
        patient: studentName,
        package: line.feeItem,
        feeItem: line.feeItem,
        amount: line.amount,
        method: this.paymentMethod,
        date: this.paymentDate,
        collectedBy: this.collectedBy,
        referenceNumber: this.referenceNumber,
        notes: this.notes,
        status: 'Completed',
        accountId: this.selectedAccount.backendId || this.selectedAccount.id,
        registrationNumber: this.selectedAccount.registrationNumber
      }).subscribe();
    });

    const invoiceTotals = this.zatcaInvoice.fromVatInclusive(amount);
    const invoiceId = receiptBatchId;
    this.invoicesService.addInvoice({
      id: invoiceId,
      invoiceNumber: `INV-${invoiceId}`,
      patient: studentName,
      service: payableLines.map((line) => line.feeItem).join(' + '),
      amount: invoiceTotals.amountBeforeVat,
      discount: 0,
      vat: invoiceTotals.vat,
      total: invoiceTotals.total,
      date: this.paymentDate,
      status: 'Paid',
      paid: invoiceTotals.total,
      remaining: Math.max(this.outstanding - amount, 0),
      paymentMethod: this.paymentMethod,
      receipt: receiptNumber,
      taxNumber: this.zatcaInvoice.taxNumber,
      accountId: this.selectedAccount.id,
      feeItem: payableLines.map((line) => line.feeItem).join(' + '),
      registrationNumber: this.selectedAccount.registrationNumber,
      patientId: this.selectedAccount.registrationNumber,
      fileNo: this.selectedAccount.registrationNumber,
      notes: this.notes,
      user: this.collectedBy
    }).subscribe();

    const paid = Number(this.selectedAccount.paid || 0) + amount;
    const remaining = Math.max(Number(this.selectedAccount.total || 0) - paid, 0);
    const nextAccount = {
      ...this.selectedAccount,
      paid,
      remaining,
      status: remaining <= 0 ? 'Paid' : 'Partial',
      notificationStatus: 'seen'
    };

    this.accountService.updatePackage(nextAccount.id, nextAccount).subscribe(() => {
      this.selectedAccount = nextAccount;
      this.loadPreviousPayments();
    });

    if (nextAccount.remaining > 0) {
      this.storage.notify(
        `${studentName} has ${nextAccount.remaining.toLocaleString()} SAR remaining after payment.`,
        ['Admissions', 'Finance', 'Super Admin'],
        'finance',
        '/finance/patient-packages'
      );
    } else {
      this.storage.notify(
        `${studentName} is fully paid.`,
        ['Admissions', 'Finance', 'Super Admin'],
        'finance',
        '/finance/patient-packages'
      );
    }

    alert('Payment saved successfully. School invoice generated automatically.');
    this.router.navigate(['/finance/invoice-details', invoiceId]);
  }

  private buildPaymentLines(): PaymentLine[] {
    const services = Array.isArray(this.selectedAccount?.services) && this.selectedAccount.services.length
      ? this.selectedAccount.services
      : [{ service: 'School Fees', price: Number(this.selectedAccount?.total || 0) }];

    return services.map((service: any) => ({
      feeItem: service.service || 'School Fees',
      expected: Number(service.price || 0) * Number(service.sessions || 1),
      amount: 0
    }));
  }

  private allocateAmount(targetAmount: number): void {
    let remainingToAllocate = Math.max(Number(targetAmount || 0), 0);

    this.paymentLines = this.paymentLines.map((line) => {
      const amount = Math.min(line.expected, remainingToAllocate);
      remainingToAllocate -= amount;
      return { ...line, amount };
    });
  }

  private loadPreviousPayments(): void {
    const studentName = this.selectedAccount?.patient;
    if (!studentName) {
      this.previousPayments = [];
      return;
    }

    this.paymentsService.getPayments().subscribe((payments: any[]) => {
      this.previousPayments = payments
        .filter((payment) => payment.patient === studentName || payment.accountId === this.selectedAccount.id)
        .reverse();
    });
  }
}
