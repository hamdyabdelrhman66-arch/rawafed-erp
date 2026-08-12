import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  AccountingAccount,
  AccountingService,
  JournalEntry,
} from "../../../core/finance/accounting.service";
import { AccountNamePipe } from "../../../core/i18n/account-name.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { StatusLabelPipe } from "../../../core/i18n/status-label.pipe";
import { TranslatePipe } from "../../../core/i18n/translate.pipe";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import {
  FeedbackService,
  safeErrorMessage,
} from "../../../core/feedback/feedback.service";
import { AuthService } from "../../../core/auth/auth.service";
import { ReportExportService, ReportTable } from "../../../core/reports/report-export.service";
import { formatAccountingBalance } from "../../../core/finance/accounting-balance";

type AccountingTab = "overview" | "accounts" | "journal" | "ledger" | "trial" | "mappings";
type AccountFormMode = "details" | "create" | "edit";
type AccountFormModel = {
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: string;
  parentId: string;
  openingBalance: number;
  openingDate: string;
  currency: string;
  status: string;
  notes: string;
  normalBalance: "debit" | "credit";
  postingAccount: boolean;
  isCashAccount: boolean;
  isBankAccount: boolean;
  isVatAccount: boolean;
  isReceivableAccount: boolean;
  isPayableAccount: boolean;
};

@Component({
  selector: "app-accounting-erp",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    StatusLabelPipe,
    AccountNamePipe,
    SearchableSelectComponent,
  ],
  templateUrl: "./accounting-erp.html",
  styleUrls: [
    "./accounting-erp.css",
    "../../../shared/finance/finance-ui.scss",
  ],
})
export class AccountingErp implements OnInit {
  activeTab: AccountingTab = "overview";
  loading = false;
  error = "";

  accounts: AccountingAccount[] = [];
  entries: JournalEntry[] = [];
  ledger: any;
  trialBalance: any;
  dashboard: any;
  revenueMappings: any[] = [];
  costCenters: Array<{
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
  }> = [];
  selectedJournal: JournalEntry | null = null;
  journalVoucherLoading = false;
  journalSummary: any = {};
  journalSearch = "";
  journalStatus = "";
  editingJournalId = "";
  savingJournal = false;
  journalValidationError = "";
  selectedAccount: AccountingAccount | null = null;
  accountModalMode: AccountFormMode = "details";
  accountFormOpen = false;
  accountForm: AccountFormModel = this.emptyAccountForm();
  accountLedgerPreview: any = null;

  selectedAccountId = "";
  fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  toDate = new Date().toISOString().slice(0, 10);
  trialDisplayMode: "activity" | "balance" | "all" = "activity";
  trialAccountType = "";
  trialParentAccountId = "";
  trialBranch = "";
  trialCostCenterId = "";
  trialCurrency = "";
  trialAccountStatus = "active";
  trialSearch = "";
  trialReportScope = "standard";
  showParentAccounts = false;
  readonly branchOptions = [{ id: "main", name: "Main Branch" }];
  readonly currencyOptions = ["SAR"];
  collapsedTrialAccounts = new Set<string>();
  readonly accountOptionLabel = (account: AccountingAccount) =>
    this.accountDisplayName(account);

  draftEntry = {
    postingDate: new Date().toISOString().slice(0, 10),
    referenceNumber: "",
    description: "",
    status: "DRAFT" as "DRAFT",
    lines: [
      { accountId: "", description: "", debit: 0, credit: 0 },
      { accountId: "", description: "", debit: 0, credit: 0 },
    ],
  };

  constructor(
    private readonly accounting: AccountingService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly i18n: I18nService,
    private readonly feedback: FeedbackService,
    private readonly auth: AuthService,
    private readonly reportExport: ReportExportService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get("tab") as AccountingTab | null;
      if (tab === "accounts") {
        void this.router.navigate(["/finance/chart-of-accounts"], {
          replaceUrl: true,
        });
        return;
      }
      if (
        tab &&
        ["overview", "accounts", "journal", "ledger", "trial", "mappings"].includes(tab)
      ) {
        this.activeTab = tab;
      } else {
        this.activeTab = "overview";
      }
    });
    void this.load();
  }

  setActiveTab(tab: AccountingTab): void {
    if (tab === "accounts") {
      void this.router.navigate(["/finance/chart-of-accounts"]);
      return;
    }
    this.activeTab = tab;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: tab === "overview" ? {} : { tab },
      queryParamsHandling: "replace",
    });
  }

  get accountCount(): number {
    return this.accounts.length;
  }

  get postedEntries(): number {
    return this.entries.filter((entry) => entry.status === "posted").length;
  }

  get totalDebit(): number {
    return Number(this.trialBalance?.totals?.periodDebit || 0);
  }

  get totalCredit(): number {
    return Number(this.trialBalance?.totals?.periodCredit || 0);
  }

  get balanced(): boolean {
    return Boolean(this.trialBalance?.balanced);
  }

  get trialRows(): any[] {
    return this.trialBalance?.rows || [];
  }

  get trialTotals(): any {
    return this.trialBalance?.totals || {};
  }

  get parentAccounts(): AccountingAccount[] {
    const parentIds = new Set(
      this.accounts
        .filter((account) => account.parentId)
        .map((account) => account.parentId),
    );
    return this.accounts.filter((account) => parentIds.has(account.id));
  }

  get accountTypeOptions(): string[] {
    return ["asset", "liability", "equity", "revenue", "expense"];
  }

  get accountModalTitle(): string {
    if (this.accountModalMode === "create")
      return this.i18n.t("accounting.new_account");
    if (this.accountModalMode === "edit")
      return this.i18n.t("accounting.edit_account");
    return this.i18n.t("accounting.account_details");
  }

  get accountDetailRows(): Array<{ label: string; value: string }> {
    const account = this.selectedAccount;
    if (!account) return [];
    return [
      { label: this.i18n.t("common.code"), value: account.code },
      {
        label: this.i18n.t("accounting.english_name"),
        value: account.nameEn || "-",
      },
      {
        label: this.i18n.t("accounting.arabic_name"),
        value: account.nameAr || "-",
      },
      {
        label: this.i18n.t("common.type"),
        value: this.i18n.t(`type.${account.type}`),
      },
      {
        label: this.i18n.t("common.parent"),
        value: this.accountDisplayName(this.findAccount(account.parentId)),
      },
      {
        label: this.i18n.t("common.opening"),
        value: this.money(account.openingBalance),
      },
      {
        label: this.i18n.t("accounting.current_balance"),
        value: this.money(account.currentBalance),
      },
      {
        label: this.i18n.t("accounting.debit_total"),
        value: this.money(account.debit),
      },
      {
        label: this.i18n.t("accounting.credit_total"),
        value: this.money(account.credit),
      },
      {
        label: this.i18n.t("accounting.journal_entries"),
        value: String(account.journalEntries || 0),
      },
      {
        label: this.i18n.t("common.status"),
        value: this.i18n.status(account.status),
      },
    ];
  }

  get selectedAccountFlags(): string[] {
    const account = this.selectedAccount;
    if (!account) return [];
    const flags = [
      account.postingAccount ? this.i18n.t("accounting.posting_account") : "",
      account.isCashAccount ? this.i18n.t("accounting.cash_account") : "",
      account.isBankAccount ? this.i18n.t("accounting.bank_account") : "",
      account.isVatAccount ? this.i18n.t("accounting.vat_account") : "",
      account.isReceivableAccount
        ? this.i18n.t("accounting.receivable_account")
        : "",
      account.isPayableAccount ? this.i18n.t("accounting.payable_account") : "",
    ];
    return flags.filter(Boolean);
  }

  get visibleTrialRows(): any[] {
    if (!this.showParentAccounts) return this.trialRows;
    const rowsById = new Map(this.trialRows.map((row) => [row.accountId, row]));
    return this.trialRows.filter((row) => {
      let parentId = row.parentId;
      while (parentId) {
        if (this.collapsedTrialAccounts.has(parentId)) return false;
        parentId = rowsById.get(parentId)?.parentId;
      }
      return true;
    });
  }

  get accountTypes(): Array<{ type: string; count: number }> {
    return ["asset", "liability", "equity", "revenue", "expense"].map(
      (type) => ({
        type,
        count: this.accounts.filter((account) => account.type === type).length,
      }),
    );
  }

  get kpiCards(): Array<{ label: string; value: number; note: string }> {
    const kpis = this.dashboard?.kpis || {};
    return [
      {
        label: this.i18n.t("finance.kpi.cash_balance"),
        value: kpis.cashBalance,
        note: this.i18n.t("finance.kpi.cash_balance_note_full"),
      },
      {
        label: this.i18n.t("finance.kpi.bank_balance"),
        value: kpis.bankBalance,
        note: this.i18n.t("finance.kpi.bank_balance_note"),
      },
      {
        label: this.i18n.t("finance.kpi.accounts_receivable"),
        value: kpis.accountsReceivable,
        note: this.i18n.t("finance.kpi.accounts_receivable_note"),
      },
      {
        label: this.i18n.t("finance.kpi.accounts_payable"),
        value: kpis.accountsPayable,
        note: this.i18n.t("finance.kpi.accounts_payable_note"),
      },
      {
        label: this.i18n.t("finance.kpi.fixed_assets"),
        value: kpis.fixedAssets,
        note: this.i18n.t("finance.kpi.fixed_assets_note"),
      },
      {
        label: this.i18n.t("finance.kpi.current_assets"),
        value: kpis.currentAssets,
        note: this.i18n.t("finance.kpi.current_assets_note"),
      },
      {
        label: this.i18n.t("finance.kpi.current_liabilities"),
        value: kpis.currentLiabilities,
        note: this.i18n.t("finance.kpi.current_liabilities_note"),
      },
      {
        label: this.i18n.t("finance.kpi.vat_receivable"),
        value: kpis.vatReceivable,
        note: this.i18n.t("finance.kpi.vat_receivable_note"),
      },
      {
        label: this.i18n.t("finance.kpi.vat_payable"),
        value: kpis.vatPayable,
        note: this.i18n.t("finance.kpi.vat_payable_note"),
      },
      {
        label: this.i18n.t("finance.kpi.net_profit"),
        value: kpis.netProfit,
        note: this.i18n.t("finance.kpi.net_profit_note"),
      },
      {
        label: this.i18n.t("finance.kpi.owner_equity"),
        value: kpis.ownerEquity,
        note: this.i18n.t("finance.kpi.owner_equity_note"),
      },
    ];
  }

  get workflowCards(): Array<{ label: string; value: number }> {
    const workflow = this.dashboard?.workflow || {};
    return [
      {
        label: this.i18n.t("accounting.pending_approvals"),
        value: workflow.pendingApprovals || 0,
      },
      {
        label: this.i18n.t("accounting.draft_journals"),
        value: workflow.draftJournals || 0,
      },
      {
        label: this.i18n.t("accounting.unposted_journals"),
        value: workflow.unpostedJournals || 0,
      },
    ];
  }

  get debitTotal(): number {
    return this.draftEntry.lines.reduce(
      (sum, line) => sum + Number(line.debit || 0),
      0,
    );
  }

  get creditTotal(): number {
    return this.draftEntry.lines.reduce(
      (sum, line) => sum + Number(line.credit || 0),
      0,
    );
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      const [accounts, entries, trialBalance, _costCenters, dashboard, revenueMappings, journalSummary] =
        await Promise.all([
          this.accounting.getAccounts(),
          this.accounting.getJournalEntries(),
          this.loadTrialBalance(),
          this.loadCostCenters(),
          this.accounting.getDashboard(this.fromDate, this.toDate),
          this.accounting.getRevenueMappings(),
          this.accounting.getJournalSummary(),
        ]);
      this.accounts = accounts;
      this.entries = entries;
      this.trialBalance = trialBalance;
      this.dashboard = dashboard;
      this.revenueMappings = revenueMappings;
      this.journalSummary = journalSummary;
      this.selectedAccountId ||=
        accounts.find((account) => account.systemKey === "main-cashbox")?.id ||
        accounts[0]?.id ||
        "";
      await this.loadLedger();
    } catch (error) {
      this.error = safeErrorMessage(error) || "Could not load accounting data.";
    } finally {
      this.loading = false;
    }
  }

  async saveRevenueMapping(mapping: any): Promise<void> {
    try {
      await this.accounting.updateRevenueMapping(mapping.category, mapping);
      this.feedback.success(this.i18n.label('Accounting mapping saved.', 'تم حفظ الربط المحاسبي.'));
      this.revenueMappings = await this.accounting.getRevenueMappings();
    } catch (error) {
      this.feedback.error(this.i18n.label('Mapping could not be saved.', 'تعذر حفظ الربط.'), safeErrorMessage(error));
    }
  }

  async loadLedger(): Promise<void> {
    if (!this.selectedAccountId) return;
    this.ledger = await this.accounting.getLedger(
      this.selectedAccountId,
      this.fromDate,
      this.toDate,
    );
  }

  accountDisplayName(account: AccountingAccount | null | undefined): string {
    if (!account) return "-";
    return `${account.code} - ${this.i18n.label(account.nameEn || "-", account.nameAr)}`;
  }

  findAccount(id?: string): AccountingAccount | undefined {
    return id ? this.accounts.find((account) => account.id === id) : undefined;
  }

  isParentAccount(account: AccountingAccount): boolean {
    return this.accounts.some((item) => item.parentId === account.id);
  }

  async openAccountDetails(account: AccountingAccount): Promise<void> {
    this.selectedAccount = account;
    this.selectedAccountId = account.id;
    this.accountModalMode = "details";
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    try {
      this.accountLedgerPreview = await this.accounting.getLedger(
        account.id,
        this.fromDate,
        this.toDate,
      );
    } catch {
      this.accountLedgerPreview = { transactions: [] };
    }
  }

  async openNewParentAccount(): Promise<void> {
    this.selectedAccount = null;
    this.accountModalMode = "create";
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    this.accountForm = this.emptyAccountForm();
    await this.suggestCodeForForm();
  }

  async openNewChildAccount(parent?: AccountingAccount | null): Promise<void> {
    const selectedParent = parent || this.selectedAccount;
    this.accountModalMode = "create";
    this.accountFormOpen = true;
    this.accountLedgerPreview = null;
    this.accountForm = this.emptyAccountForm({
      parentId: selectedParent?.id || "",
      type: selectedParent?.type || "asset",
      normalBalance:
        selectedParent?.normalBalance ||
        this.defaultNormalBalance(selectedParent?.type || "asset"),
    });
    await this.suggestCodeForForm();
  }

  editSelectedAccount(): void {
    if (!this.selectedAccount) return;
    const account = this.selectedAccount;
    this.accountModalMode = "edit";
    this.accountForm = this.emptyAccountForm({
      id: account.id,
      code: account.code,
      nameAr: account.nameAr || "",
      nameEn: account.nameEn || "",
      type: account.type || "asset",
      parentId: account.parentId || "",
      openingBalance: Number(account.openingBalance || 0),
      openingDate: account.openingDate || "",
      currency: account.currency || "SAR",
      status: account.status || "active",
      notes: account.notes || "",
      normalBalance:
        account.normalBalance ||
        this.defaultNormalBalance(account.type || "asset"),
      postingAccount: account.postingAccount !== false,
      isCashAccount: Boolean(account.isCashAccount),
      isBankAccount: Boolean(account.isBankAccount),
      isVatAccount: Boolean(account.isVatAccount),
      isReceivableAccount: Boolean(account.isReceivableAccount),
      isPayableAccount: Boolean(account.isPayableAccount),
    });
  }

  async saveAccountForm(): Promise<void> {
    this.error = "";
    const payload = {
      ...this.accountForm,
      parentId: this.accountForm.parentId || null,
      openingBalance: Number(this.accountForm.openingBalance || 0),
    };
    try {
      const saved =
        this.accountModalMode === "edit" && this.accountForm.id
          ? await this.accounting.updateAccount(this.accountForm.id, payload)
          : await this.accounting.createAccount(payload);
      this.accounts = await this.accounting.getAccounts();
      this.selectedAccount = this.findAccount(saved.id) || saved;
      this.accountModalMode = "details";
      await this.openAccountDetails(this.selectedAccount);
      this.feedback.success(
        `${this.accountDisplayName(this.selectedAccount)} saved successfully.`,
      );
    } catch (error) {
      this.error = safeErrorMessage(error);
      this.feedback.error("Account could not be saved.", this.error);
    }
  }

  closeAccountModal(): void {
    this.accountFormOpen = false;
    this.accountModalMode = "details";
    this.accountLedgerPreview = null;
  }

  onAccountTypeChange(): void {
    this.accountForm.normalBalance = this.defaultNormalBalance(
      this.accountForm.type,
    );
    void this.suggestCodeForForm();
  }

  async suggestCodeForForm(): Promise<void> {
    try {
      const result = await this.accounting.suggestAccountCode(
        this.accountForm.parentId,
        this.accountForm.type,
      );
      this.accountForm.code = result.code || this.accountForm.code;
    } catch {
      // Manual code entry remains available if code suggestion is not reachable.
    }
  }

  private emptyAccountForm(
    overrides: Partial<AccountFormModel> = {},
  ): AccountFormModel {
    return {
      code: "",
      nameAr: "",
      nameEn: "",
      type: "asset",
      parentId: "",
      openingBalance: 0,
      openingDate: "",
      currency: "SAR",
      status: "active",
      notes: "",
      normalBalance: "debit",
      postingAccount: true,
      isCashAccount: false,
      isBankAccount: false,
      isVatAccount: false,
      isReceivableAccount: false,
      isPayableAccount: false,
      ...overrides,
    };
  }

  private defaultNormalBalance(type: string): "debit" | "credit" {
    return ["asset", "expense"].includes(type) ? "debit" : "credit";
  }

  async loadTrialBalance(): Promise<any> {
    return this.accounting.getTrialBalance({
      fromDate: this.fromDate,
      toDate: this.toDate,
      displayMode: this.trialDisplayMode,
      accountType: this.trialAccountType,
      parentAccountId: this.trialParentAccountId,
      branch: this.trialBranch,
      costCenterId: this.trialCostCenterId,
      currency: this.trialCurrency,
      accountStatus: this.trialAccountStatus,
      search: this.trialSearch,
      showZeroBalances: this.trialDisplayMode === "all",
      showParentAccounts: this.showParentAccounts,
    });
  }

  async refreshTrialBalance(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      this.trialBalance = await this.loadTrialBalance();
    } catch (error) {
      this.error = safeErrorMessage(error) || "Could not load trial balance.";
    } finally {
      this.loading = false;
    }
  }

  setTrialDisplayMode(mode: "activity" | "balance" | "all"): void {
    this.trialDisplayMode = mode;
    void this.refreshTrialBalance();
  }

  toggleTrialAccount(row: any): void {
    if (!row.isParent) return;
    if (this.collapsedTrialAccounts.has(row.accountId)) {
      this.collapsedTrialAccounts.delete(row.accountId);
    } else {
      this.collapsedTrialAccounts.add(row.accountId);
    }
  }

  isTrialCollapsed(row: any): boolean {
    return this.collapsedTrialAccounts.has(row.accountId);
  }

  async openLedgerFromTrial(row: any): Promise<void> {
    this.selectedAccountId = row.accountId;
    this.setActiveTab("ledger");
    await this.loadLedger();
  }

  async openJournalVoucher(journalEntryId: string): Promise<void> {
    this.journalVoucherLoading = true;
    this.error = "";
    try {
      this.selectedJournal = await this.accounting.getJournalDetails(journalEntryId);
    } catch (error) {
      this.selectedJournal = null;
      this.error = safeErrorMessage(error) || this.i18n.label(
        "Could not load the journal voucher.",
        "تعذر تحميل سند القيد.",
      );
      this.feedback.error(
        this.i18n.label("Journal voucher could not be opened.", "تعذر فتح سند القيد."),
        this.error,
      );
    } finally {
      this.journalVoucherLoading = false;
    }
  }

  closeJournalVoucher(): void {
    this.selectedJournal = null;
  }

  printJournalVoucher(): void {
    window.print();
  }

  journalDate(value?: string): string {
    if (!value) return this.i18n.label("Not specified", "غير محدد");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.i18n.label("Not specified", "غير محدد");
    return new Intl.DateTimeFormat(this.i18n.language() === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  journalDateTime(value?: string): string {
    if (!value) return this.i18n.label("Not specified", "غير محدد");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.i18n.label("Not specified", "غير محدد");
    return new Intl.DateTimeFormat(this.i18n.language() === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  journalCreator(entry: JournalEntry): string {
    if (entry.createdByName) return entry.createdByName;
    if (typeof entry.createdBy === "string") return entry.createdBy;
    return entry.createdBy?.displayName || entry.createdBy?.username || this.i18n.label("System", "النظام");
  }

  journalSourceLabel(entry: JournalEntry): string {
    const source = String(entry.sourceType || "").toLowerCase();
    const labels: Record<string, [string, string]> = {
      manual_journal: ["Manual journal — entered from General Journal", "قيد يدوي — أُنشئ مباشرة من دفتر اليومية"],
      finance_invoice: ["Automatic journal — generated from an invoice", "قيد تلقائي — ناتج عن إصدار فاتورة"],
      finance_payment: ["Automatic journal — generated from a payment receipt", "قيد تلقائي — ناتج عن دفعة وسند قبض"],
      journal_reversal: ["Reversal journal — generated from a posted journal", "قيد عكسي — ناتج عن عكس قيد مرحّل"],
      student_discount: ["Automatic journal — generated from a student discount", "قيد تلقائي — ناتج عن خصم طالب"],
      cash_bank_transfer: ["Automatic journal — cash/bank transfer", "قيد تلقائي — تحويل بين النقدية والبنك"],
      payroll: ["Automatic journal — generated by payroll", "قيد تلقائي — ناتج عن مسير الرواتب"],
    };
    const label = labels[source];
    if (label) return this.i18n.label(label[0], label[1]);
    return entry.automatic
      ? this.i18n.label("Automatic journal generated by the system", "قيد تلقائي أنشأه النظام")
      : this.i18n.label("Manual journal", "قيد يدوي");
  }

  journalRelatedDocument(entry: JournalEntry): string {
    if (entry.sourceTransactionNumber) return entry.sourceTransactionNumber;
    if (entry.referenceNumber) return entry.referenceNumber;
    if (String(entry.sourceType || "").toLowerCase() === "manual_journal") {
      return this.i18n.label("No external document — entered manually", "لا يوجد مستند خارجي — القيد مُدخل يدويًا");
    }
    return entry.sourceId || this.i18n.label("Not specified", "غير محدد");
  }

  journalMoney(value: unknown): string {
    return this.i18n.money(Number(value || 0), "SAR");
  }

  journalAccountName(line: JournalEntry["lines"][number]): string {
    const name = this.i18n.language() === "ar"
      ? (line.accountNameAr || line.accountNameEn)
      : (line.accountNameEn || line.accountNameAr);
    return [line.accountCode, name].filter(Boolean).join(" — ") || this.i18n.label("Account unavailable", "بيانات الحساب غير متاحة");
  }

  journalCostCenter(line: JournalEntry["lines"][number]): string {
    const name = this.i18n.language() === "ar"
      ? (line.costCenterNameAr || line.costCenterNameEn)
      : (line.costCenterNameEn || line.costCenterNameAr);
    return [line.costCenterCode, name].filter(Boolean).join(" — ") || "—";
  }

  journalDebitTotal(entry: JournalEntry): number {
    return entry.lines.reduce((total, line) => total + Number(line.debit || 0), 0);
  }

  journalCreditTotal(entry: JournalEntry): number {
    return entry.lines.reduce((total, line) => total + Number(line.credit || 0), 0);
  }

  async loadCostCenters(): Promise<any[]> {
    if (this.costCenters.length) return this.costCenters;
    this.costCenters = await this.accounting.getCostCenters();
    return this.costCenters;
  }

  addLine(): void {
    this.draftEntry.lines.push({
      accountId: "",
      description: "",
      debit: 0,
      credit: 0,
    });
  }

  removeLine(index: number): void {
    if (this.draftEntry.lines.length <= 2) return;
    this.draftEntry.lines.splice(index, 1);
  }

  get canPostJournalDirectly(): boolean {
    return this.auth.canAccess(["Finance", "Accountant", "Finance Manager", "Chief Accountant"]);
  }

  showJournals(status = ""): void {
    this.journalStatus = status;
    window.setTimeout(() => {
      document.getElementById("journal-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async saveJournal(action: "draft" | "submit" | "post" = "draft"): Promise<void> {
    this.error = "";
    this.journalValidationError = this.validateJournalDraft();
    if (this.journalValidationError) {
      this.error = this.journalValidationError;
      this.feedback.validation(
        this.journalValidationError,
        this.i18n.label("Please review the journal entry", "يرجى مراجعة القيد اليدوي"),
      );
      return;
    }
    const payload = {
      ...this.draftEntry,
      lines: this.draftEntry.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      })),
    };
    this.savingJournal = true;
    try {
      const isEdit = Boolean(this.editingJournalId);
      if (this.editingJournalId)
        await this.accounting.updateJournalEntry(
          this.editingJournalId,
          payload,
        );
      else if (action === "draft") await this.accounting.createJournalEntry(payload);
      else await this.accounting.createAndTransitionJournal(payload, action);
      this.resetJournalForm();
      await this.load();
      this.setActiveTab("journal");
      this.feedback.success(
        isEdit
          ? "Journal entry updated successfully."
          : action === "post"
            ? this.i18n.label("Journal saved and posted successfully.", "تم حفظ القيد وترحيله بنجاح.")
            : action === "submit"
              ? this.i18n.label("Journal saved and submitted for review.", "تم حفظ القيد وإرساله للمراجعة.")
              : this.i18n.label("Journal draft saved successfully.", "تم حفظ مسودة القيد بنجاح."),
      );
    } catch (error) {
      this.error = safeErrorMessage(error);
      this.feedback.error(
        this.i18n.label("Journal entry could not be saved.", "تعذر حفظ القيد اليدوي."),
        this.error,
      );
    } finally {
      this.savingJournal = false;
    }
  }

  private validateJournalDraft(): string {
    if (!this.draftEntry.postingDate) {
      return this.i18n.label("Posting date is required.", "يجب إدخال تاريخ الترحيل.");
    }
    if (!this.draftEntry.description.trim()) {
      return this.i18n.label(
        "The general journal description is required, even when line descriptions are entered.",
        "يجب إدخال الوصف العام للقيد، حتى عند كتابة وصف لكل سطر.",
      );
    }
    if (this.draftEntry.lines.length < 2) {
      return this.i18n.label("At least two journal lines are required.", "يجب إدخال سطرين على الأقل للقيد.");
    }
    for (let index = 0; index < this.draftEntry.lines.length; index += 1) {
      const line = this.draftEntry.lines[index];
      if (!line.accountId) {
        return this.i18n.label(
          `Select an account for line ${index + 1}.`,
          `يجب اختيار الحساب في السطر رقم ${index + 1}.`,
        );
      }
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) {
        return this.i18n.label(
          `Line ${index + 1} must contain either a debit or a credit amount.`,
          `يجب أن يحتوي السطر رقم ${index + 1} على مبلغ مدين أو دائن فقط.`,
        );
      }
    }
    if (Math.abs(this.debitTotal - this.creditTotal) > 0.01) {
      return this.i18n.label(
        "Debit and credit totals must be equal.",
        "يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.",
      );
    }
    return "";
  }

  editJournal(entry: JournalEntry): void {
    if (entry.status.toUpperCase() !== "DRAFT") {
      this.error = this.i18n.label("Posted entries cannot be edited. Use Correct Entry.", "لا يمكن تعديل القيد المرحل. استخدم تصحيح القيد.");
      return;
    }
    if (entry.sourceType && entry.sourceType !== "manual_journal") {
      this.error = "Only manual journal entries can be edited from here.";
      return;
    }
    this.editingJournalId = entry.id;
    this.draftEntry = {
      postingDate: entry.postingDate,
      referenceNumber: entry.referenceNumber || "",
      description: entry.description,
      status: "DRAFT",
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description || "",
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      })),
    };
    this.setActiveTab("journal");
  }

  get filteredJournals(): JournalEntry[] {
    const q = this.journalSearch.trim().toLowerCase();
    return this.entries.filter((entry) => (!this.journalStatus || entry.status.toUpperCase() === this.journalStatus) && (!q || [entry.entryNumber, entry.description, entry.referenceNumber, entry.sourceTransactionNumber].some((value) => String(value || '').toLowerCase().includes(q))));
  }

  journalTotal(entry: JournalEntry, side: 'debit' | 'credit'): number {
    return entry.lines.reduce((sum, line) => sum + Number(line[side] || 0), 0);
  }

  async journalAction(entry: JournalEntry, action: 'submit' | 'approve' | 'post' | 'cancel' | 'reverse'): Promise<void> {
    try {
      if (action === 'reverse') await this.accounting.reverseJournal(entry.id);
      else await this.accounting.transitionJournal(entry.id, action);
      await this.load(); this.setActiveTab('journal');
      this.feedback.success(this.i18n.label('Journal action completed.', 'تم تنفيذ إجراء القيد.'));
    } catch (error) { this.feedback.error(this.i18n.label('Journal action failed.', 'تعذر تنفيذ إجراء القيد.'), safeErrorMessage(error)); }
  }

  async correctJournal(entry: JournalEntry): Promise<void> {
    const warning = entry.automatic
      ? this.i18n.label('This automatic journal should normally be corrected from its source. Accounting-only correction creates a reversal and a corrected draft; the original remains unchanged. Enter the mandatory reason:', 'هذا القيد تم إنشاؤه تلقائيًا من عملية تشغيلية. يفضل تصحيح العملية الأصلية. التصحيح المحاسبي سينشئ قيد عكس ومسودة مصححة ولن يحذف القيد الأصلي. أدخل سبب التصحيح الإلزامي:')
      : this.i18n.label('Correction creates a reversal and a corrected draft; the original remains unchanged. Enter the mandatory reason:', 'التصحيح سينشئ قيد عكس ومسودة مصححة ولن يحذف القيد الأصلي. أدخل سبب التصحيح الإلزامي:');
    const reason = window.prompt(warning, '');
    if (!reason || reason.trim().length < 10) return;
    try { const result = await this.accounting.correctJournal(entry.id, reason, Boolean(entry.automatic)); await this.load(); this.setActiveTab('journal'); this.openJournalVoucher(result.corrected.id); this.feedback.success(this.i18n.label('Reversal and corrected draft created.', 'تم إنشاء قيد العكس والمسودة المصححة.')); }
    catch (error) { this.feedback.error(this.i18n.label('Correction failed.', 'تعذر تصحيح القيد.'), safeErrorMessage(error)); }
  }

  async deleteJournal(entry: JournalEntry): Promise<void> {
    if (!this.canPermanentlyDeleteJournal(entry)) {
      this.error = this.i18n.label(
        "Permanent deletion is available for manual journals, student invoices, and student payments only.",
        "الحذف النهائي متاح للقيود اليدوية وفواتير الطلاب ومدفوعاتهم فقط.",
      );
      this.feedback.warning(this.error);
      return;
    }
    const confirmed = await this.feedback.confirm({
      title: this.i18n.label("Permanently delete journal?", "حذف القيد نهائيًا؟"),
      message: this.i18n.label(
        `Journal ${entry.entryNumber}, related invoices, payments, receipts, allocations, and financial effect will be permanently removed. This cannot be undone.`,
        `سيتم حذف القيد ${entry.entryNumber} والفواتير والمدفوعات والسندات والتخصيصات والأثر المالي المرتبط به نهائيًا، ولا يمكن التراجع عن ذلك.`,
      ),
      confirmText: this.i18n.label("Permanently Delete", "حذف نهائي"),
      tone: "danger",
    });
    if (!confirmed) return;
    this.error = "";
    try {
      await this.accounting.deleteJournalEntry(entry.id);
      if (this.editingJournalId === entry.id) this.resetJournalForm();
      await this.load();
      this.setActiveTab("journal");
      this.feedback.success(
        this.i18n.label(
          `Journal ${entry.entryNumber} and its related records were permanently deleted.`,
          `تم حذف القيد ${entry.entryNumber} وكل السجلات المرتبطة به نهائيًا.`,
        ),
      );
    } catch (error) {
      this.error = safeErrorMessage(error);
      this.feedback.error(
        this.i18n.label("Journal and related financial documents could not be deleted.", "تعذر حذف القيد والمستندات المالية المرتبطة."),
        this.error,
      );
    }
  }

  canPermanentlyDeleteJournal(entry: JournalEntry): boolean {
    const sourceType = entry.sourceType || (entry.automatic ? "" : "manual_journal");
    return ["manual_journal", "finance_invoice", "finance_payment"].includes(sourceType);
  }

  resetJournalForm(): void {
    this.editingJournalId = "";
    this.journalValidationError = "";
    this.error = "";
    this.draftEntry.description = "";
    this.draftEntry.referenceNumber = "";
    this.draftEntry.status = "DRAFT";
    this.draftEntry.postingDate = new Date().toISOString().slice(0, 10);
    this.draftEntry.lines = [
      { accountId: "", description: "", debit: 0, credit: 0 },
      { accountId: "", description: "", debit: 0, credit: 0 },
    ];
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString("en-US")} SAR`;
  }

  accountingBalance(value: unknown): string {
    return formatAccountingBalance(value, this.i18n.language());
  }

  chartWidth(rows: any[] = [], key = "value", row: any): number {
    const max = Math.max(
      1,
      ...rows.map((item) => Math.abs(Number(item[key] || 0))),
    );
    return Math.max(
      4,
      Math.round((Math.abs(Number(row[key] || 0)) / max) * 100),
    );
  }

  async exportTrialExcel(): Promise<void> {
    await this.reportExport.downloadExcel(this.trialBalanceExport());
    this.feedback.success("Trial balance exported successfully.");
  }

  async exportTrialPdf(): Promise<void> {
    await this.reportExport.downloadPdf(this.trialBalanceExport());
  }

  async printTrialPdf(): Promise<void> {
    await this.reportExport.printPdf(this.trialBalanceExport());
  }

  private trialBalanceExport(): ReportTable {
    const headers = [
      this.i18n.label("Code", "الكود"),
      this.i18n.label("Account", "الحساب"),
      this.i18n.label("Type", "النوع"),
      this.i18n.label("Opening Debit", "افتتاحي مدين"),
      this.i18n.label("Opening Credit", "افتتاحي دائن"),
      this.i18n.label("Period Debit", "حركة مدين"),
      this.i18n.label("Period Credit", "حركة دائن"),
      this.i18n.label("Closing Debit", "ختامي مدين"),
      this.i18n.label("Closing Credit", "ختامي دائن"),
    ];
    const rows = this.visibleTrialRows.map((row) => [
      row.code,
      `${" ".repeat(Number(row.level || 0) * 2)}${this.i18n.language() === "ar" ? row.nameAr || row.nameEn : row.nameEn}`,
      row.type,
      row.openingDebit,
      row.openingCredit,
      row.periodDebit,
      row.periodCredit,
      row.closingDebit,
      row.closingCredit,
    ]);
    return {
      title: "Trial Balance",
      titleAr: "ميزان المراجعة",
      subtitle: `${this.fromDate} - ${this.toDate}`,
      columns: headers,
      rows,
      summary: [
        { label: this.i18n.label("Closing Debit", "إجمالي الختامي المدين"), value: this.trialTotals.closingDebit || 0 },
        { label: this.i18n.label("Closing Credit", "إجمالي الختامي الدائن"), value: this.trialTotals.closingCredit || 0 },
        { label: this.i18n.label("Difference", "الفرق"), value: Math.abs(Number(this.trialTotals.closingDebit || 0) - Number(this.trialTotals.closingCredit || 0)) },
      ],
      fileName: `trial-balance-${this.fromDate}-to-${this.toDate}`,
      direction: this.i18n.direction(),
      locale: this.i18n.language(),
      generatedBy: this.auth.session()?.displayName,
      chart: {
        labels: [this.i18n.label("Debit", "مدين"), this.i18n.label("Credit", "دائن")],
        values: [Number(this.trialTotals.closingDebit || 0), Number(this.trialTotals.closingCredit || 0)],
      },
    };
  }
}
