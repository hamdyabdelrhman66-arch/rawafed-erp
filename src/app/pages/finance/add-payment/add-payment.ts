import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnInit, ViewChild } from "@angular/core";
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
import { I18nService } from "../../../core/i18n/i18n.service";

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
  @ViewChild('paymentDetails') paymentDetails?: ElementRef<HTMLElement>;
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
  loadingAccounts = true;
  loadingStudent = false;
  contextError = "";
  selectedInvoice: any = null;
  selectedInstallment: any = null;
  private pendingReceiptNumber = "";
  readonly accountLabel = (account: any) =>
    account
      ? `${account.patient} - ${account.registrationNumber || account.fileNo || "-"} - ${this.l('Grade', 'الصف')} ${account.grade || "-"} - ${this.l('Remaining', 'المتبقي')} ${Number(account.remaining || 0).toLocaleString(this.i18n.language() === 'ar' ? 'ar-SA' : 'en-US')} ${this.currency()}`
      : "";

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly accountService: PatientPackagesService,
    private readonly paymentsService: PaymentsService,
    private readonly invoicesService: InvoicesService,
    private readonly feedback: FeedbackService,
    public readonly i18n: I18nService,
  ) {}

  l(en: string, ar: string): string { return this.i18n.label(en, ar); }

  currency(): string { return this.l('SAR', 'ريال'); }

  paymentMethodLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      Cash: ['Cash', 'نقدي'], Card: ['Card', 'بطاقة'], 'Bank Transfer': ['Bank Transfer', 'تحويل بنكي']
    };
    const label = labels[value];
    return label ? this.l(label[0], label[1]) : value;
  }

  feeItemLabel(value: string): string {
    const labels: Record<string, [string, string]> = {
      'School Fees': ['School Fees', 'الرسوم الدراسية'], Tuition: ['Tuition', 'رسوم التعليم'],
      'Registration Fee': ['Registration Fee', 'رسوم التسجيل'], Uniform: ['Uniform', 'الزي المدرسي'],
      'Bus Transportation': ['Bus Transportation', 'النقل المدرسي'], Transportation: ['Transportation', 'النقل المدرسي'],
      Books: ['Books', 'الكتب'], Activities: ['Activities', 'الأنشطة'], VAT: ['VAT', 'ضريبة القيمة المضافة']
    };
    const label = labels[value];
    return label ? this.l(label[0], label[1]) : value;
  }

  async ngOnInit(): Promise<void> {
    // A direct visit must always start clean. Never reuse a previously viewed student.
    this.clearSelectedStudent();
    try {
      this.accounts = await firstValueFrom(this.accountService.getPackages());
    } catch (error) {
      this.contextError = safeErrorMessage(error);
    } finally {
      this.loadingAccounts = false;
    }

    const studentId = this.route.snapshot.queryParamMap.get("studentId");
    if (!studentId) return;
    if (!this.isUuid(studentId)) {
      this.contextError = this.l("The supplied student ID is invalid.", "معرّف الطالب المرسل غير صالح.");
      return;
    }
    await this.loadStudentContext(
      studentId,
      this.route.snapshot.queryParamMap.get("invoiceId") || undefined,
      this.route.snapshot.queryParamMap.get("installmentId") || undefined,
    );
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

  private applyAccount(account: any): void {
    this.pendingReceiptNumber = "";
    this.contextError = "";
    this.selectedAccount = account;
    this.paymentLines = this.buildPaymentLines();
    this.loadPreviousPayments();
  }

  async selectAccount(account: any): Promise<void> {
    if (!account) {
      this.clearSelectedStudent();
      return;
    }
    if (!account.studentId) {
      this.clearSelectedStudent();
      this.contextError = this.l("This account is not linked to a valid student record.", "هذا الحساب غير مرتبط بسجل طالب صالح.");
      return;
    }
    await this.loadStudentContext(account.studentId);
  }

  goBack(): void {
    const source = this.route.snapshot.queryParamMap.get('source');
    const customerId = this.route.snapshot.queryParamMap.get('customerId');
    const tab = this.route.snapshot.queryParamMap.get('returnTab') || 'overview';
    if (source === 'student-profile' && customerId) {
      void this.router.navigate(['/finance/customers', customerId], { queryParams: { tab } });
      return;
    }
    void this.router.navigate(['/finance/payments']);
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
    if (this.saving || this.loadingStudent) return;
    const payableLines = this.paymentLines
      .map((line) => ({ ...line, amount: Number(line.amount || 0) }))
      .filter((line) => line.amount > 0);

    if (!this.selectedAccount || !payableLines.length) {
      this.feedback.validation(
        this.l("Please select student account and enter at least one payment amount.", "يرجى اختيار حساب الطالب وإدخال مبلغ واحد على الأقل."),
      );
      return;
    }

    const amount = this.totalPaymentAmount;
    if (amount > this.outstanding) {
      this.feedback.validation(
        this.l("Payment amount cannot be more than the remaining balance.", "لا يمكن أن يزيد مبلغ الدفع عن الرصيد المتبقي."),
      );
      return;
    }

    const confirmed = await this.feedback.confirm({
      title: this.l("Record Student Payment?", "تسجيل دفعة الطالب؟"),
      message: this.l(`This will record ${amount.toLocaleString("en-US")} SAR against the existing invoice and update the student balance.`, `سيتم تسجيل مبلغ ${amount.toLocaleString("ar-SA")} ريال على الفاتورة الحالية وتحديث رصيد الطالب.`),
      confirmText: this.l("Record Payment", "تسجيل الدفعة"),
      tone: "primary",
    });
    if (!confirmed) return;

    this.saving = true;
    const receiptNumber = this.pendingReceiptNumber || `REC-${crypto.randomUUID()}`;
    this.pendingReceiptNumber = receiptNumber;
    const studentName = this.selectedAccount.patient;

    try {
      const result = await this.paymentsService.recordPayment({
        accountId: this.selectedAccount.backendId || this.selectedAccount.id,
        receiptNumber,
        ...(this.selectedInvoice?.id ? { invoiceId: this.selectedInvoice.id } : {}),
        ...(this.selectedInstallment?.id ? { installmentId: this.selectedInstallment.id } : {}),
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
        this.l(`Payment ${receiptNumber} recorded successfully.`, `تم تسجيل الدفعة ${receiptNumber} بنجاح.`),
        this.l("Receipt and student balance were updated from PostgreSQL.", "تم تحديث الإيصال ورصيد الطالب من PostgreSQL."),
      );
      this.pendingReceiptNumber = "";
      const invoices = await firstValueFrom(this.invoicesService.getInvoices());
      const invoiceId = result?.payment?.invoiceId || result?.payment?.invoiceIds?.[0] || this.selectedInvoice?.id;
      const invoice = invoices.find((item: any) => (item.backendId || item.id) === invoiceId);
      if (invoice)
        void this.router.navigate(["/finance/invoices", invoice.backendId || invoice.id], {
          queryParams: { receipt: result?.payment?.receiptNumber || receiptNumber },
        });
    } catch (error) {
      this.feedback.error(this.l("Payment was not recorded.", "لم يتم تسجيل الدفعة."), safeErrorMessage(error));
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
    const backendAccountId = this.selectedAccount?.backendId;
    if (!backendAccountId) {
      this.previousPayments = [];
      return;
    }

    this.paymentsService.getPayments().subscribe((payments: any[]) => {
      this.previousPayments = payments
        .filter(
          (payment) => payment.backendAccountId === backendAccountId,
        )
        .reverse();
    });
  }

  private async loadStudentContext(studentId: string, invoiceId?: string, installmentId?: string): Promise<void> {
    this.loadingStudent = true;
    this.contextError = "";
    this.clearSelectedStudent(false);
    try {
      const context = await this.accountService.getPaymentContext(studentId, invoiceId, installmentId);
      const index = this.accounts.findIndex((row) => row.studentId === studentId);
      if (index >= 0) this.accounts[index] = context.account;
      else this.accounts = [context.account, ...this.accounts];
      this.selectedInvoice = context.selectedInvoice;
      this.selectedInstallment = context.selectedInstallment;
      this.applyAccount(context.account);
      this.preloadAllocation();
      setTimeout(() => this.paymentDetails?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (error) {
      this.clearSelectedStudent(false);
      this.contextError = safeErrorMessage(error);
    } finally {
      this.loadingStudent = false;
    }
  }

  private preloadAllocation(): void {
    const target = Number(this.selectedInstallment?.remaining || this.selectedInvoice?.remaining || 0);
    if (target <= 0) return;
    let remaining = this.money(Math.min(target, this.outstanding));
    this.paymentLines = this.paymentLines.map((line) => {
      const amount = this.money(Math.min(line.expected, remaining));
      remaining = this.money(remaining - amount);
      return { ...line, amount };
    });
  }

  private clearSelectedStudent(clearError = true): void {
    this.selectedAccount = null;
    this.selectedInvoice = null;
    this.selectedInstallment = null;
    this.paymentLines = [];
    this.previousPayments = [];
    this.pendingReceiptNumber = "";
    if (clearError) this.contextError = "";
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
