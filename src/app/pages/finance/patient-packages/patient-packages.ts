import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { InvoicesService } from "../../../core/finance/invoices.service";
import { PatientPackagesService } from "../../../core/finance/patient-packages.service";

@Component({
  selector: "app-patient-packages",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./patient-packages.html",
  styleUrls: [
    "./patient-packages.css",
    "../../../shared/finance/finance-ui.scss",
  ],
})
export class PatientPackages implements OnInit, OnDestroy {
  searchText = "";

  packages: any[] = [];
  invoices: any[] = [];
  state: "loading" | "loaded" | "empty" | "error" | "unauthorized" | "stale" =
    "loading";
  errorMessage = "";
  private requestVersion = 0;
  private readonly refreshAccounts = () => this.loadAccounts();
  private readonly refreshFromStorage = (event: StorageEvent) => {
    if (
      event.key === "rawafed_finance" ||
      event.key === "rawafed.registrations"
    )
      this.loadAccounts();
  };
  private readonly refreshWhenVisible = () => {
    if (!document.hidden) this.loadAccounts();
  };

  constructor(
    private patientPackagesService: PatientPackagesService,
    private invoicesService: InvoicesService,
  ) {}

  ngOnInit() {
    this.loadAccounts();
    window.addEventListener("rawafed-finance-updated", this.refreshAccounts);
    window.addEventListener("storage", this.refreshFromStorage);
    window.addEventListener("focus", this.refreshAccounts);
    document.addEventListener("visibilitychange", this.refreshWhenVisible);
  }

  ngOnDestroy(): void {
    window.removeEventListener("rawafed-finance-updated", this.refreshAccounts);
    window.removeEventListener("storage", this.refreshFromStorage);
    window.removeEventListener("focus", this.refreshAccounts);
    document.removeEventListener("visibilitychange", this.refreshWhenVisible);
  }

  refresh(): void {
    this.loadAccounts();
  }

  private loadAccounts(): void {
    const version = ++this.requestVersion;
    if (!this.packages.length) this.state = "loading";
    this.errorMessage = "";

    this.patientPackagesService.getPackages().subscribe({
      next: (packages: any[]) => {
        if (version !== this.requestVersion) return;
        if (!packages.length && this.packages.length) {
          this.state = "stale";
          this.errorMessage =
            "The server returned no finance accounts. Last successful data remains visible.";
          return;
        }
        this.packages = packages;
        this.state = packages.length ? "loaded" : "empty";
      },
      error: (error: any) => {
        if (version !== this.requestVersion) return;
        const status = Number(error?.status || error?.response?.status || 0);
        this.state =
          status === 401 || status === 403
            ? "unauthorized"
            : this.packages.length
              ? "stale"
              : "error";
        this.errorMessage =
          status === 401 || status === 403
            ? "You are not authorized to view student finance accounts."
            : "Student finance accounts could not be refreshed. Last successful data remains visible.";
      },
    });

    this.invoicesService.getInvoices().subscribe({
      next: (invoices: any[]) => {
        if (version === this.requestVersion) this.invoices = invoices;
      },
      error: () => {
        // Account visibility must not be destroyed by a secondary invoice request.
      },
    });
  }

  get filteredAccounts(): any[] {
    const text = this.searchText.trim().toLowerCase();
    if (!text) return this.packages;

    return this.packages.filter((item) =>
      [item.patient, item.registrationNumber, item.grade, item.status].some(
        (value) =>
          String(value || "")
            .toLowerCase()
            .includes(text),
      ),
    );
  }

  get totalAccounts(): number {
    return this.packages.length;
  }

  get totalExpected(): number {
    return this.packages.reduce(
      (sum, item) => sum + Number(item.total || 0),
      0,
    );
  }

  get totalPaid(): number {
    return this.packages.reduce((sum, item) => sum + Number(item.paid || 0), 0);
  }

  get totalOutstanding(): number {
    return this.packages.reduce(
      (sum, item) => sum + Number(item.remaining || 0),
      0,
    );
  }

  get newAccounts(): number {
    return this.packages.filter(
      (item) =>
        item.notificationStatus === "new" || Number(item.paid || 0) === 0,
    ).length;
  }

  latestInvoiceId(account: any): number | null {
    const invoice = this.invoices
      .filter(
        (item) =>
          item.accountId === account.id ||
          item.registrationNumber === account.registrationNumber,
      )
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];

    return invoice?.id || null;
  }
}
