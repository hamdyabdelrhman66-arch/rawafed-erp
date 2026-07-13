import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { InvoicesService } from "../../../core/finance/invoices.service";
import { PatientPackagesService } from "../../../core/finance/patient-packages.service";
import { PaymentsService } from "../../../core/finance/payments.service";
import {
  allocateHalf,
  allocateRemaining,
} from "../../../core/finance/payment-allocation";
import {
  FeedbackService,
  safeErrorMessage,
} from "../../../core/feedback/feedback.service";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";

interface PaymentLine {
  feeItem: string;
  expected: number;
  amount: number;
}

@Component({
  selector: "app-add-payment",
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: "./add-payment.html",
  styleUrls: ["./add-payment.css", "../../../shared/finance/finance-ui.scss"],
})
export class AddPayment implements OnInit {
  accounts: any[] = [];
  selectedAccount: any = null;
  paymentMethod = "Cash";
  paymentDate = new Date().toISOString().split("T")[0];
  collectedBy = "Finance";
  referenceNumber = "";
  notes = "";
  previousPayments: any[] = [];
  paymentLines: PaymentLine[] = [];
  saving = false;
  readonly accountLabel = (account: any) =>
    account
      ? `${account.patient} - ${account.registrationNumber || account.fileNo || "-"} - Grade ${account.grade || "-"} - Remaining ${Number(account.remaining || 0).toLocaleString("en-US")} SAR`
      : "";

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly accountService: PatientPackagesService,
    private readonly paymentsService: PaymentsService,
    private readonly invoicesService: InvoicesService,
    private readonly feedback: FeedbackService,
  ) {}

  ngOnInit(): void {
    this.accountService.getPackages().subscribe((accounts: any[]) => {
      this.accounts = accounts;
      const accountId = Number(
        this.route.snapshot.queryParamMap.get("accountId"),
      );
      this.selectedAccount = accountId
        ? this.accounts.find((item) => item.id === accountId) || null
        : null;
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
    return this.paymentLines.reduce(
      (sum, line) => sum + Number(line.amount || 0),
      0,
    );
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
    const allocation = allocateHalf(this.paymentLines);
    this.paymentLines = this.paymentLines.map((line, index) => ({
      ...line,
      amount: allocation[index],
    }));
  }

  payRemaining(): void {
    const allocation = allocateRemaining(this.paymentLines);
    this.paymentLines = this.paymentLines.map((line, index) => ({
      ...line,
      amount: allocation[index],
    }));
  }

  clearPaymentLines(): void {
    this.paymentLines = this.paymentLines.map((line) => ({
      ...line,
      amount: 0,
    }));
  }

  async savePayment(): Promise<void> {
    if (this.saving) return;
    const payableLines = this.paymentLines
      .map((line) => ({ ...line, amount: Number(line.amount || 0) }))
      .filter((line) => line.amount > 0);

    if (!this.selectedAccount || !payableLines.length) {
      this.feedback.validation(
        "Please select student account and enter at least one payment amount.",
      );
      return;
    }

    const amount = this.totalPaymentAmount;
    if (amount > this.outstanding) {
      this.feedback.validation(
        "Payment amount cannot be more than the remaining balance.",
      );
      return;
    }

    const confirmed = await this.feedback.confirm({
      title: "Record Student Payment?",
      message: `This will record ${amount.toLocaleString("en-US")} SAR against the existing invoice and update the student balance.`,
      confirmText: "Record Payment",
      tone: "primary",
    });
    if (!confirmed) return;

    this.saving = true;
    const receiptNumber = `REC-${crypto.randomUUID()}`;
    const studentName = this.selectedAccount.patient;

    try {
      await this.paymentsService.recordPayment({
        accountId: this.selectedAccount.backendId || this.selectedAccount.id,
        invoiceId: this.selectedAccount.canonicalInvoiceId,
        receiptNumber,
        amount,
        method: this.paymentMethod,
        paidAt: this.paymentDate,
        referenceNumber: this.referenceNumber,
        notes: this.notes,
        lines: payableLines.map((line) => ({
          feeItem: line.feeItem,
          amount: line.amount,
        })),
      });
      const refreshed = await firstValueFrom(this.accountService.getPackages());
      this.accounts = refreshed;
      this.selectedAccount =
        refreshed.find(
          (account: any) =>
            account.backendId === this.selectedAccount.backendId,
        ) || this.selectedAccount;
      this.paymentLines = this.buildPaymentLines();
      this.loadPreviousPayments();
      this.feedback.success(
        `Payment ${receiptNumber} recorded successfully.`,
        "Receipt and student balance were updated from PostgreSQL.",
      );
      const invoices = await firstValueFrom(this.invoicesService.getInvoices());
      const invoice = invoices.find(
        (item: any) =>
          item.registrationNumber === this.selectedAccount.registrationNumber,
      );
      if (invoice)
        void this.router.navigate(["/finance/invoice-details", invoice.id]);
    } catch (error) {
      this.feedback.error("Payment was not recorded.", safeErrorMessage(error));
    } finally {
      this.saving = false;
    }
  }

  private buildPaymentLines(): PaymentLine[] {
    const services =
      Array.isArray(this.selectedAccount?.services) &&
      this.selectedAccount.services.length
        ? this.selectedAccount.services
        : [
            {
              service: "School Fees",
              price: Number(this.selectedAccount?.total || 0),
            },
          ];

    return services.map((service: any) => ({
      feeItem: service.service || "School Fees",
      expected: this.money(
        service.remaining ??
          Number(service.price || 0) * Number(service.sessions || 1),
      ),
      amount: 0,
    }));
  }

  private money(value: unknown): number {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  private loadPreviousPayments(): void {
    const studentName = this.selectedAccount?.patient;
    if (!studentName) {
      this.previousPayments = [];
      return;
    }

    this.paymentsService.getPayments().subscribe((payments: any[]) => {
      this.previousPayments = payments
        .filter(
          (payment) =>
            payment.patient === studentName ||
            payment.accountId === this.selectedAccount.id,
        )
        .reverse();
    });
  }
}
