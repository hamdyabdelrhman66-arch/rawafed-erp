import { Injectable } from "@angular/core";
import { Observable, from, map, of } from "rxjs";
import { ApiService } from "../api/api.service";
import { AdmissionRegistration } from "../models/admission.models";
import {
  FinanceData,
  FinanceExpense,
  FinanceInvoice,
  FinancePackage,
  FinancePayment,
  FinanceStudent,
  registrationToFinanceStudent,
} from "./finance.models";

const FINANCE_STORAGE_KEY = "rawafed_finance";
const FINANCE_UPDATED_EVENT = "rawafed-finance-updated";

const EMPTY_FINANCE_DATA: FinanceData = {
  patients: [],
  packages: [],
  payments: [],
  invoices: [],
  expenses: [],
};

@Injectable({ providedIn: "root" })
export class FinanceStorageService {
  constructor(private readonly api: ApiService) {}

  getPatients(): Observable<FinanceStudent[]> {
    return from(this.api.get<any[]>("/students")).pipe(
      map((students) =>
        students.map(
          (student) =>
            ({
              id: this.numericId(student.id),
              name: student.englishName || student.arabicName || "Student",
              phone: student.parentPhone || "",
              guardian: student.parentName || "",
              diagnosis: student.grade || "",
              age: "",
              notes: student.registrationNumber || "",
              registrationId: student.registrationId,
              registrationNumber: student.registrationNumber,
            }) as FinanceStudent,
        ),
      ),
    );
  }

  getPatient(id: number): Observable<FinanceStudent | undefined> {
    return this.getPatients().pipe(
      map((items) => items.find((item) => item.id === Number(id))),
    );
  }

  addPatient(patient: FinanceStudent): Observable<FinanceStudent> {
    const data = this.read();
    const next = { ...patient, id: Number(patient.id || Date.now()) };
    this.write({ ...data, patients: [...data.patients, next] });
    return of(next);
  }

  updatePatient(
    id: number,
    patient: FinanceStudent,
  ): Observable<FinanceStudent> {
    const data = this.read();
    const next = { ...patient, id: Number(id) };
    this.write({
      ...data,
      patients: data.patients.map((item) =>
        item.id === Number(id) ? next : item,
      ),
    });
    return of(next);
  }

  deletePatient(id: number): Observable<void> {
    const data = this.read();
    this.write({
      ...data,
      patients: data.patients.filter((item) => item.id !== Number(id)),
      packages: data.packages.filter((item) => item.patientId !== Number(id)),
    });
    return of(void 0);
  }

  getPackages(): Observable<FinancePackage[]> {
    return from(this.api.get<any[]>("/finance/accounts")).pipe(
      map((accounts) =>
        accounts.map((account) => this.backendAccountToPackage(account)),
      ),
    );
  }

  fromBackendAccount(account: any): FinancePackage {
    return this.backendAccountToPackage(account);
  }

  getPackage(id: number): Observable<FinancePackage | undefined> {
    return this.getPackages().pipe(
      map((items) => items.find((item) => item.id === Number(id))),
    );
  }

  addPackage(studentPackage: FinancePackage): Observable<FinancePackage> {
    const data = this.read();
    const next = {
      ...studentPackage,
      id: Number(studentPackage.id || Date.now()),
    };
    this.write({ ...data, packages: [...data.packages, next] });
    return of(next);
  }

  updatePackage(
    id: number,
    studentPackage: FinancePackage,
  ): Observable<FinancePackage> {
    const data = this.read();
    const next = { ...studentPackage, id: Number(id) };
    this.write({
      ...data,
      packages: data.packages.map((item) =>
        item.id === Number(id) ? next : item,
      ),
    });
    return of(next);
  }

  deletePackage(id: number): Observable<void> {
    const data = this.read();
    this.write({
      ...data,
      packages: data.packages.filter((item) => item.id !== Number(id)),
    });
    return of(void 0);
  }

  getPayments(): Observable<FinancePayment[]> {
    return from(this.api.get<any[]>("/finance/payments")).pipe(
      map((payments) =>
        payments.map((payment) => this.backendPaymentToPayment(payment)),
      ),
    );
  }

  getPayment(id: number): Observable<FinancePayment | undefined> {
    return this.getPayments().pipe(
      map((items) => items.find((item) => item.id === Number(id))),
    );
  }

  addPayment(payment: FinancePayment): Observable<FinancePayment> {
    if (payment.accountId) {
      return from(
        this.api.post<any>("/finance/payments", {
          accountId: String(payment.accountId),
          paymentItem: payment.feeItem || payment.package || "School Fees",
          amount: Number(payment.amount || 0),
          method: payment.method || "Cash",
          paidAt: payment.date,
          referenceNumber: payment.referenceNumber,
          notes: payment.notes,
        }),
      ).pipe(
        map((result) => {
          window.dispatchEvent(new CustomEvent(FINANCE_UPDATED_EVENT));
          return this.backendPaymentToPayment(result.payment);
        }),
      );
    }
    return this.addPaymentLocal(payment);
  }

  private addPaymentLocal(payment: FinancePayment): Observable<FinancePayment> {
    const data = this.read();
    const next = { ...payment, id: Number(payment.id || Date.now()) };
    this.write({ ...data, payments: [...data.payments, next] });
    return of(next);
  }

  updatePayment(
    id: number,
    payment: FinancePayment,
  ): Observable<FinancePayment> {
    const data = this.read();
    const next = { ...payment, id: Number(id) };
    this.write({
      ...data,
      payments: data.payments.map((item) =>
        item.id === Number(id) ? next : item,
      ),
    });
    return of(next);
  }

  deletePayment(id: number): Observable<void> {
    const data = this.read();
    this.write({
      ...data,
      payments: data.payments.filter((item) => item.id !== Number(id)),
    });
    return of(void 0);
  }

  getInvoices(): Observable<FinanceInvoice[]> {
    return from(this.api.get<any[]>("/finance/invoices")).pipe(
      map((invoices) =>
        invoices.map((invoice) => this.backendInvoiceToInvoice(invoice)),
      ),
    );
  }

  getInvoice(id: number): Observable<FinanceInvoice | undefined> {
    return this.getInvoices().pipe(
      map((items) => items.find((item) => item.id === Number(id))),
    );
  }

  addInvoice(invoice: FinanceInvoice): Observable<FinanceInvoice> {
    return from(this.api.post<any>("/finance/invoices", invoice)).pipe(
      map((created) => this.backendInvoiceToInvoice(created)),
    );
  }

  private addInvoiceLocal(invoice: FinanceInvoice): Observable<FinanceInvoice> {
    const data = this.read();
    const next = { ...invoice, id: Number(invoice.id || Date.now()) };
    this.write({ ...data, invoices: [...data.invoices, next] });
    return of(next);
  }

  updateInvoice(
    id: number,
    invoice: FinanceInvoice,
  ): Observable<FinanceInvoice> {
    const data = this.read();
    const next = { ...invoice, id: Number(id) };
    this.write({
      ...data,
      invoices: data.invoices.map((item) =>
        item.id === Number(id) ? next : item,
      ),
    });
    return of(next);
  }

  deleteInvoice(id: number): Observable<void> {
    const data = this.read();
    this.write({
      ...data,
      invoices: data.invoices.filter((item) => item.id !== Number(id)),
    });
    return of(void 0);
  }

  getExpenses(): Observable<FinanceExpense[]> {
    return from(this.api.get<any[]>("/finance/expenses")).pipe(
      map((expenses) =>
        expenses.map((expense) => this.backendExpenseToExpense(expense)),
      ),
    );
  }

  getExpense(id: number): Observable<FinanceExpense | undefined> {
    return this.getExpenses().pipe(
      map((items) => items.find((item) => item.id === Number(id))),
    );
  }

  addExpense(expense: FinanceExpense): Observable<FinanceExpense> {
    return from(this.api.post<any>("/finance/expenses", expense)).pipe(
      map((created) => this.backendExpenseToExpense(created)),
    );
  }

  payExpense(id: string, payload: any): Observable<any> {
    return from(this.api.post<any>(`/finance/expenses/${id}/payments`, payload));
  }

  private addExpenseLocal(expense: FinanceExpense): Observable<FinanceExpense> {
    const data = this.read();
    const next = { ...expense, id: Number(expense.id || Date.now()) };
    this.write({ ...data, expenses: [...data.expenses, next] });
    return of(next);
  }

  updateExpense(
    id: number,
    expense: FinanceExpense,
  ): Observable<FinanceExpense> {
    const data = this.read();
    const next = { ...expense, id: Number(id) };
    this.write({
      ...data,
      expenses: data.expenses.map((item) =>
        item.id === Number(id) ? next : item,
      ),
    });
    return of(next);
  }

  deleteExpense(id: number): Observable<void> {
    const data = this.read();
    this.write({
      ...data,
      expenses: data.expenses.filter((item) => item.id !== Number(id)),
    });
    return of(void 0);
  }

  ensureAccountFromRegistration(
    registration: AdmissionRegistration,
  ): FinancePackage {
    const data = this.read();
    const existingPackage = data.packages.find(
      (item) =>
        item.registrationId === registration.id ||
        (!item.registrationId &&
          item.registrationNumber === registration.registrationNumber),
    );
    if (existingPackage) return existingPackage;

    const studentId = this.financeId(registration, 1);
    const packageId = this.financeId(registration, 2);
    const invoiceId = this.financeId(registration, 3);
    const total = Number(registration.financial.grandTotal || 0);
    const student = registrationToFinanceStudent(registration, studentId);
    const today = new Date().toISOString().slice(0, 10);
    const feeItems = this.buildFeeItems(registration);

    const studentPackage: FinancePackage = {
      id: packageId,
      patientId: student.id,
      patient: student.name,
      startDate: today,
      sessionsPerWeek: 0,
      expectedEndDate: "",
      total,
      paid: 0,
      remaining: total,
      usedSessions: 0,
      progress: 0,
      sessions: `${feeItems.length} fee items`,
      status: "Unpaid",
      services: feeItems,
      grade: registration.student.applyingGrade,
      paymentPlan: registration.financial.paymentPlan,
      notificationStatus: "new",
      registrationId: registration.id,
      registrationNumber: registration.registrationNumber,
    };

    const invoice: FinanceInvoice = {
      id: invoiceId,
      invoiceNumber: `INV-${registration.registrationNumber || invoiceId}`,
      patient: student.name,
      service: "School Fees",
      amount: total,
      date: today,
      status: "Pending",
      paid: 0,
      remaining: total,
      accountId: packageId,
      feeItem: "School Fees",
      registrationId: registration.id,
      registrationNumber: registration.registrationNumber,
    };

    this.write({
      ...data,
      patients: data.patients.some(
        (item) =>
          item.registrationId === registration.id ||
          (!item.registrationId &&
            item.registrationNumber === registration.registrationNumber),
      )
        ? data.patients
        : [...data.patients, student],
      packages: [...data.packages, studentPackage],
      invoices: [...data.invoices, invoice],
    });

    return studentPackage;
  }

  ensureAccountsFromRegistrations(
    registrations: AdmissionRegistration[],
  ): FinancePackage[] {
    registrations
      .filter(
        (registration) =>
          registration.submittedAt || registration.status !== "draft",
      )
      .forEach((registration) =>
        this.ensureAccountFromRegistration(registration),
      );
    return this.read().packages;
  }

  private read(): FinanceData {
    try {
      const raw = localStorage.getItem(FINANCE_STORAGE_KEY);
      return this.normalize(
        raw ? (JSON.parse(raw) as Partial<FinanceData>) : EMPTY_FINANCE_DATA,
      );
    } catch {
      return structuredClone(EMPTY_FINANCE_DATA);
    }
  }

  private write(data: FinanceData): void {
    localStorage.setItem(
      FINANCE_STORAGE_KEY,
      JSON.stringify(this.normalize(data)),
    );
    window.dispatchEvent(new CustomEvent(FINANCE_UPDATED_EVENT));
  }

  private normalize(data: Partial<FinanceData>): FinanceData {
    return {
      patients: data.patients || [],
      packages: data.packages || [],
      payments: data.payments || [],
      invoices: data.invoices || [],
      expenses: data.expenses || [],
    };
  }

  private backendAccountToPackage(account: any): FinancePackage {
    const id = this.numericId(account.id);
    return {
      id,
      patientId: this.numericId(account.registrationId || account.id),
      patient: account.studentName || account.patient || "Student",
      startDate: (account.createdAt || new Date().toISOString()).slice(0, 10),
      sessionsPerWeek: 0,
      expectedEndDate: "",
      total: Number(account.expectedTotal || account.total || 0),
      paid: Number(account.paid || 0),
      remaining: Number(account.remaining || 0),
      usedSessions: 0,
      progress: 0,
      sessions: `${account.feeItems?.length || 0} fee items`,
      status:
        account.status === "paid"
          ? "Paid"
          : account.status === "partial"
            ? "Partial"
            : "Unpaid",
      services: (account.feeItems || []).map((item: any) => ({
        service: item.name,
        category: item.category,
        sessions: 1,
        price: Number(item.amount || 0),
        paid: Number(item.paid || 0),
        remaining: Number(item.remaining ?? item.amount ?? 0),
        vatRate: Number(item.vatRate || 0),
        governmentBorneVat: Number(item.governmentBorneVat || 0),
        taxTreatment: item.taxTreatment || 'STANDARD',
        taxReason: item.taxReason || undefined,
        customPrice: false,
      })),
      grade: account.grade,
      paymentPlan: account.paymentPlan || "FULL",
      paidInstallments: Number(account.paidInstallments || 0),
      remainingInstallments: Number(account.remainingInstallments || 0),
      overdueInstallments: Number(account.overdueInstallments || 0),
      nextInstallment: Number(account.nextInstallment || 0),
      nextDueDate: account.nextDueDate || undefined,
      notificationStatus: Number(account.paid || 0) > 0 ? "seen" : "new",
      registrationId: account.registrationId,
      registrationNumber: account.registrationNumber,
      backendId: account.id,
      studentId: account.studentId,
      canonicalInvoiceId: account.canonicalInvoiceId,
      subtotal: Number(account.subtotal || 0),
      vat: Number(account.vat || 0),
      totalVat: Number(account.totalVat || account.vat || 0),
      governmentBorneVat: Number(account.governmentBorneVat || 0),
      vatExempt: Boolean(account.vatExempt),
      nationalId: account.nationalId || '',
      openInvoices: account.openInvoices || [],
      installments: account.installments || [],
    };
  }

  private backendPaymentToPayment(payment: any): FinancePayment {
    return {
      id: this.numericId(payment.id),
      receipt: payment.receiptNumber || payment.receipt || "",
      patient: payment.studentName || payment.patient || "",
      package: payment.paymentItem || payment.package || "School Fees",
      amount: Number(payment.amount || 0),
      method: payment.method || "Cash",
      date: (
        payment.paidAt ||
        payment.createdAt ||
        new Date().toISOString()
      ).slice(0, 10),
      status: "Paid",
      collectedBy: payment.collectedBy,
      referenceNumber: payment.referenceNumber,
      notes: payment.notes,
      feeItem: payment.paymentItem,
      accountId: this.numericId(payment.accountId),
      backendAccountId: payment.accountId,
      registrationNumber: payment.registrationNumber,
      nationalId: payment.nationalId || '',
      vatExempt: Boolean(payment.vatExempt),
      feeItems: Array.isArray(payment.feeItems)
        ? payment.feeItems.map((item: any) => ({ name: item.name, amount: Number(item.amount || 0) }))
        : [],
      invoices: Array.isArray(payment.invoices)
        ? payment.invoices.map((invoice: any) => ({ ...invoice, subtotal: Number(invoice.subtotal || 0), vat: Number(invoice.vat || 0), total: Number(invoice.total || 0), amount: Number(invoice.amount || 0) }))
        : [],
    };
  }

  private backendInvoiceToInvoice(invoice: any): FinanceInvoice {
    return {
      id: this.numericId(invoice.id),
      backendId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      patient: invoice.studentName || invoice.patient || "",
      studentArabicName: invoice.studentArabicName || '',
      customerId: invoice.customerId,
      nationalId: invoice.nationalId || '',
      service: invoice.feeItem || invoice.service || "School Fees",
      amount: Number(invoice.amountBeforeVat || invoice.amount || 0),
      discount: Number(invoice.discount || 0),
      vat: Number(invoice.vat || 0),
      total: Number(invoice.total || 0),
      date: (
        invoice.issuedAt ||
        invoice.createdAt ||
        new Date().toISOString()
      ).slice(0, 10),
      dueAt: invoice.dueAt?.slice(0, 10),
      status: invoice.status || "Pending",
      paid: Number(invoice.paid || 0),
      remaining: Number(invoice.remaining || 0),
      paymentMethod: invoice.paymentMethod,
      accountId: this.numericId(invoice.accountId),
      feeItem: invoice.feeItem,
      category: invoice.category || 'LEGACY_COMBINED',
      categoryLabel: invoice.categoryLabel || (invoice.legacyCombined ? 'Legacy Combined Invoice' : invoice.feeItem),
      vatStatus: invoice.vatStatus || (Number(invoice.vat || 0) > 0 ? 'STANDARD_15' : 'EXEMPT'),
      accountingAccount: invoice.accountingAccount || '',
      accountingAccountId: invoice.accountingAccountId,
      costCenterId: invoice.costCenterId,
      branchId: invoice.branchId,
      legacyCombined: Boolean(invoice.legacyCombined),
      registrationId: invoice.registrationId,
      registrationNumber: invoice.registrationNumber,
      patientId: invoice.nationalId || '',
      vatExempt: Boolean(invoice.vatExempt),
    };
  }

  private backendExpenseToExpense(expense: any): FinanceExpense {
    return {
      id: this.numericId(expense.id),
      backendId: expense.id,
      category: expense.expenseAccount?.name || expense.invoiceType || 'Expense',
      title: expense.description,
      amount: Number(expense.totalAmount || 0),
      date: expense.expenseDate,
      status: expense.paymentStatus || expense.status,
      notes: expense.notes,
      expenseNo: expense.expenseNo,
      supplierName: expense.supplier?.nameEn || expense.supplier?.nameAr || '',
      supplierInvoiceNumber: expense.supplierInvoiceNumber,
      invoiceType: expense.invoiceType,
      amountBeforeVat: Number(expense.amountBeforeVat || 0),
      vatAmount: Number(expense.vatAmount || 0),
      totalAmount: Number(expense.totalAmount || 0),
      paidAmount: Number(expense.paidAmount || 0),
      remaining: Math.max(Number(expense.totalAmount || 0) - Number(expense.paidAmount || 0), 0),
      paymentStatus: expense.paymentStatus,
      paymentMethod: expense.paymentMethod,
      costCenter: expense.costCenter,
      journalEntryNo: expense.journalEntry?.entryNumber,
      attachmentUrl: expense.attachmentUrl,
      recordStatus: expense.status,
    };
  }

  private financeId(
    registration: AdmissionRegistration,
    suffix: number,
  ): number {
    const source = `${registration.id || registration.registrationNumber || Date.now()}-${suffix}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) + suffix * 1000000;
  }

  private numericId(value: unknown): number {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
    const source = String(value || Date.now());
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) || Date.now();
  }

  private buildFeeItems(
    registration: AdmissionRegistration,
  ): FinancePackage["services"] {
    const financial = registration.financial;
    const items = [
      {
        service: "Registration Fee",
        price: Number(financial.registrationFee || 0),
      },
      { service: "Tuition", price: Number(financial.tuition || 0) },
      { service: "Books", price: Number(financial.books || 0) },
      { service: "Uniform", price: Number(financial.uniform || 0) },
      { service: "Activities", price: Number(financial.activities || 0) },
    ];

    if (financial.transportationRequired) {
      items.push({
        service: "Bus Transportation",
        price: Number(financial.transportationFee || 0),
      });
    }

    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const vatAmount = Math.max(Number(financial.grandTotal || 0) - subtotal, 0);
    if (vatAmount > 0) {
      items.push({ service: "VAT", price: vatAmount });
    }

    return items
      .filter((item) => item.price > 0)
      .map((item) => ({
        service: item.service,
        sessions: 1,
        price: item.price,
        customPrice: false,
      }));
  }
}
