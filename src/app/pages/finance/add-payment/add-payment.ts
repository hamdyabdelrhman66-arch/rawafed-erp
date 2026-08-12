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
import { AccountingService } from "../../../core/finance/accounting.service";

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
  paymentAccounts: any[] = [];
  paymentAccountId = "";
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
  additionalDiscountEnabled = false;
  discountType: "FIXED" | "PERCENTAGE" = "FIXED";
  discountValue: number | null = null;
  discountReason = "";
  discountNotes = "";
  discountEffectiveDate = this.paymentDate;
  approvalReference = "";
  private discountIdempotencyKey = "";
  paymentPreview: any = null;
  previewLoading = false;
  private paymentIdempotencyKey = "";
  private previewTimer?: ReturnType<typeof setTimeout>;
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
    private readonly accountingService: AccountingService,
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
      const [accounts, cashboxes, banks] = await Promise.all([
        firstValueFrom(this.accountService.getPackages()),
        this.accountingService.getCashboxes(),
        this.accountingService.getBanks(),
      ]);
      this.accounts = accounts;
      this.paymentAccounts = [
        ...cashboxes.filter((row: any) => row.status === 'active').map((row: any) => ({ ...row, kind: 'Cash', label: `${row.name} · ${row.accountCode}` })),
        ...banks.filter((row: any) => row.status === 'active').map((row: any) => ({ ...row, kind: 'Bank', label: `${row.bankName} · ${row.accountCode}` })),
      ];
      this.syncPaymentAccount();
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

  paymentMethodChanged(): void {
    this.paymentAccountId = '';
    this.syncPaymentAccount();
  }

  private syncPaymentAccount(): void {
    const kind = this.paymentMethod === 'Cash' ? 'Cash' : 'Bank';
    const eligible = this.paymentAccounts.filter((row) => row.kind === kind);
    if (!eligible.some((row) => row.accountId === this.paymentAccountId)) {
      this.paymentAccountId = eligible.length === 1 ? eligible[0].accountId : '';
    }
  }

  get outstanding(): number {
    return Number(this.selectedAccount?.remaining || 0);
  }

  get outstandingAfterPayment(): number {
    return Math.max(this.outstandingAfterDiscount - this.totalPaymentAmount, 0);
  }

  get grossFees(): number { return Number(this.selectedAccount?.grossFees ?? this.selectedAccount?.total ?? 0); }
  get previousDiscounts(): number { return Number(this.selectedAccount?.totalDiscounts || 0); }
  get calculatedAdditionalDiscount(): number {
    if (!this.additionalDiscountEnabled || !this.discountValue || this.discountValue <= 0) return 0;
    const amount = this.discountType === "PERCENTAGE"
      ? this.grossFees * Math.min(this.discountValue, 100) / 100
      : this.discountValue;
    return this.money(Math.min(amount, Math.max(this.grossFees - this.previousDiscounts - Number(this.selectedAccount?.paid || 0), 0)));
  }
  get totalDiscounts(): number { return this.money(this.previousDiscounts + this.calculatedAdditionalDiscount); }
  get netFeesAfterDiscount(): number { return this.money(Math.max(this.grossFees - this.totalDiscounts, 0)); }
  get outstandingAfterDiscount(): number { return this.money(Math.max(this.netFeesAfterDiscount - Number(this.selectedAccount?.paid || 0), 0)); }

  get totalPaymentAmount(): number {
    return this.paymentLines.reduce(
      (sum, line) => sum + Number(line.amount || 0),
      0,
    );
  }

  private applyAccount(account: any): void {
    this.paymentIdempotencyKey = "";
    this.paymentPreview = null;
    this.contextError = "";
    this.selectedAccount = account;
    this.resetDiscount();
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
    if (source === 'student-profile') {
      void this.router.navigate(['/finance/customers'], { queryParams: { studentId: this.selectedAccount?.studentId || this.route.snapshot.queryParamMap.get('studentId') } });
      return;
    }
    if (source === 'payments') {
      void this.router.navigate(['/finance/payments'], { queryParams: { studentId: this.selectedAccount?.studentId || null } });
      return;
    }
    void this.router.navigate(['/finance/payments']);
  }

  cancel(): void { this.goBack(); }

  payHalf(): void {
    const allocation = allocateHalf(this.paymentLines);
    this.paymentLines = this.paymentLines.map((line, index) => ({
      ...line,
      amount: allocation[index],
    }));
    this.schedulePreview();
  }

  payRemaining(): void {
    const allocation = allocateRemaining(this.paymentLines);
    this.paymentLines = this.paymentLines.map((line, index) => ({
      ...line,
      amount: allocation[index],
    }));
    this.schedulePreview();
  }

  clearPaymentLines(): void {
    this.paymentLines = this.paymentLines.map((line) => ({
      ...line,
      amount: 0,
    }));
    this.schedulePreview();
  }

  schedulePreview(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.refreshPaymentPreview(), 300);
  }

  async refreshPaymentPreview(): Promise<void> {
    if (!this.selectedAccount || this.totalPaymentAmount <= 0) { this.paymentPreview = null; return; }
    const lines = this.paymentLines.filter((line) => Number(line.amount || 0) > 0)
      .map((line) => ({ feeItem: line.feeItem, amount: Number(line.amount) }));
    this.previewLoading = true;
    try {
      this.paymentPreview = await this.paymentsService.previewPayment({
        accountId: this.selectedAccount.backendId || this.selectedAccount.id,
        ...(this.selectedInvoice?.id ? { invoiceId: this.selectedInvoice.id } : {}),
        ...(this.selectedInstallment?.id ? { installmentId: this.selectedInstallment.id } : {}),
        amount: this.totalPaymentAmount,
        lines,
      });
    } catch (error) {
      this.paymentPreview = null;
      this.contextError = safeErrorMessage(error);
    } finally { this.previewLoading = false; }
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
    if (!this.paymentAccountId) {
      this.feedback.validation(this.l('Please select the receiving cashbox or bank.', 'يرجى اختيار الصندوق أو البنك المستلم.'));
      return;
    }

    const amount = this.totalPaymentAmount;
    await this.refreshPaymentPreview();
    if (!this.paymentPreview) return;
    if (this.additionalDiscountEnabled) {
      if (!this.discountValue || this.discountValue <= 0) {
        this.feedback.validation(this.l("Discount value is required.", "يجب إدخال قيمة الخصم.")); return;
      }
      if (this.discountType === "PERCENTAGE" && this.discountValue > 100) {
        this.feedback.validation(this.l("Percentage cannot exceed 100%.", "لا يمكن أن تتجاوز نسبة الخصم 100%.")); return;
      }
      if (!this.discountReason.trim()) {
        this.feedback.validation(this.l("Discount reason is required.", "يجب توضيح سبب الخصم.")); return;
      }
    }
    if (amount > this.outstandingAfterDiscount) {
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
    const idempotencyKey = this.paymentIdempotencyKey || (this.paymentIdempotencyKey = crypto.randomUUID());

    try {
      const result = await this.paymentsService.recordPayment({
        accountId: this.selectedAccount.backendId || this.selectedAccount.id,
        idempotencyKey,
        ...(this.selectedInvoice?.id ? { invoiceId: this.selectedInvoice.id } : {}),
        ...(this.selectedInstallment?.id ? { installmentId: this.selectedInstallment.id } : {}),
        amount,
        method: this.paymentMethod,
        paymentAccountId: this.paymentAccountId,
        paidAt: this.paymentDate,
        referenceNumber: this.referenceNumber,
        notes: this.notes,
        lines: payableLines.map((line) => ({
          feeItem: line.feeItem,
          amount: line.amount,
        })),
        ...(this.additionalDiscountEnabled ? { additionalDiscount: {
          ...(this.selectedInvoice?.id ? { invoiceId: this.selectedInvoice.id } : {}),
          discountType: this.discountType,
          discountValue: Number(this.discountValue),
          reason: this.discountReason.trim(),
          notes: this.discountNotes || undefined,
          effectiveDate: this.discountEffectiveDate || this.paymentDate,
          approvalReference: this.approvalReference || undefined,
          idempotencyKey: this.discountIdempotencyKey || (this.discountIdempotencyKey = crypto.randomUUID()),
        }} : {}),
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
      const discountPending = result?.discount?.status === "PENDING_APPROVAL";
      const receiptNumber = result?.payment?.receiptNumber || result?.receipt?.receiptNumber;
      this.feedback.success(
        this.l(`Payment ${receiptNumber} recorded successfully.`, `تم تسجيل الدفعة ${receiptNumber} بنجاح.`),
        discountPending
          ? this.l("The discount request is pending approval and has not reduced the balance yet.", "طلب الخصم قيد الاعتماد ولم يُخفض الرصيد حتى الآن.")
          : this.l("Receipt, approved discount, and student balance were updated from PostgreSQL.", "تم تحديث الإيصال والخصم المعتمد ورصيد الطالب من PostgreSQL."),
      );
      this.paymentIdempotencyKey = "";
      this.resetDiscount();
      if (result?.payment?.id) void this.router.navigate(["/finance/payment-details", result.payment.id]);
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
    this.paymentIdempotencyKey = "";
    this.paymentPreview = null;
    this.resetDiscount();
    if (clearError) this.contextError = "";
  }

  private resetDiscount(): void {
    this.additionalDiscountEnabled = false;
    this.discountType = "FIXED";
    this.discountValue = null;
    this.discountReason = "";
    this.discountNotes = "";
    this.discountEffectiveDate = this.paymentDate;
    this.approvalReference = "";
    this.discountIdempotencyKey = "";
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
