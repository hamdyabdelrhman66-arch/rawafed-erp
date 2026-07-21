import { AdmissionRegistration } from "../models/admission.models";

export type FinanceStatus = "Unpaid" | "Partial" | "Paid";

export interface FinanceStudent {
  id: number;
  registrationId?: string;
  registrationNumber?: string;
  name: string;
  phone: string;
  guardian: string;
  diagnosis: string;
  age: string;
  notes: string;
}

export interface FinancePackage {
  id: number;
  patientId: number;
  patient: string;
  startDate: string;
  sessionsPerWeek: number;
  expectedEndDate: string;
  total: number;
  paid: number;
  remaining: number;
  usedSessions: number;
  progress: number;
  sessions: string;
  status: FinanceStatus;
  services: FinanceFeeItem[];
  grade?: string;
  paymentPlan?: string;
  paidInstallments?: number;
  remainingInstallments?: number;
  overdueInstallments?: number;
  nextInstallment?: number;
  nextDueDate?: string;
  notificationStatus?: "new" | "seen";
  discountPercent?: number;
  registrationId?: string;
  registrationNumber?: string;
  backendId?: string;
  studentId?: string;
  canonicalInvoiceId?: string;
  subtotal?: number;
  vat?: number;
  totalVat?: number;
  governmentBorneVat?: number;
  vatExempt?: boolean;
  nationalId?: string;
  openInvoices?: Array<{ id: string; invoiceNumber: string; category: string; issuedAt: string; dueAt?: string; total: number; paid: number; remaining: number; status: string }>;
  installments?: Array<{ id: string; dueDate: string; amount: number; paidAmount: number; remaining: number; status: string }>;
}

export interface FinanceFeeItem {
  service: string;
  category?: string;
  sessions: number;
  price: number;
  customPrice: boolean;
  paid?: number;
  remaining?: number;
  vatRate?: number;
  governmentBorneVat?: number;
  taxTreatment?: string;
  taxReason?: string;
}

export interface FinancePayment {
  id: number;
  receipt: string;
  patient: string;
  package: string;
  amount: number;
  method: string;
  date: string;
  status: string;
  collectedBy?: string;
  referenceNumber?: string;
  notes?: string;
  feeItem?: string;
  accountId?: number | string;
  backendAccountId?: string;
  registrationNumber?: string;
  nationalId?: string;
  vatExempt?: boolean;
  feeItems?: Array<{ name: string; amount: number }>;
  invoices?: Array<{ invoiceId: string; invoiceNumber: string; category: string; categoryLabel: string; subtotal: number; vat: number; total: number; amount: number }>;
}

export interface FinanceInvoice {
  id: number;
  backendId?: string;
  invoiceNumber: string;
  patient: string;
  service: string;
  amount: number;
  discount?: number;
  vat?: number;
  total?: number;
  date: string;
  status: "Pending" | "Partially Paid" | "Paid" | "Void";
  paid?: number;
  remaining?: number;
  paymentMethod?: string;
  receipt?: string;
  taxNumber?: string;
  patientId?: string;
  studentArabicName?: string;
  customerId?: string;
  nationalId?: string;
  dueAt?: string;
  fileNo?: string;
  notes?: string;
  user?: string;
  vatExempt?: boolean;
  registrationId?: string;
  registrationNumber?: string;
  accountId?: number | string;
  feeItem?: string;
  category?: string;
  categoryLabel?: string;
  vatStatus?: string;
  governmentBorneVat?: number;
  parentPayable?: number;
  taxTreatment?: string;
  taxReason?: string;
  accountingAccount?: string;
  accountingAccountId?: string;
  costCenterId?: string;
  branchId?: string;
  legacyCombined?: boolean;
}

export interface FinanceExpense {
  id: number;
  backendId?: string;
  category: string;
  title: string;
  amount: number;
  date: string;
  status: string;
  notes?: string;
  [key: string]: unknown;
}

export interface FinanceData {
  patients: FinanceStudent[];
  packages: FinancePackage[];
  payments: FinancePayment[];
  invoices: FinanceInvoice[];
  expenses: FinanceExpense[];
}

export function registrationToFinanceStudent(
  registration: AdmissionRegistration,
  id: number,
): FinanceStudent {
  const parent = registration.father.fullName
    ? registration.father
    : registration.mother;
  return {
    id,
    registrationId: registration.id,
    registrationNumber: registration.registrationNumber,
    name:
      registration.student.englishName ||
      registration.student.arabicName ||
      registration.registrationNumber ||
      `Student ${id}`,
    phone: parent.phone,
    guardian: parent.fullName,
    diagnosis: registration.student.applyingGrade,
    age: "",
    notes: registration.notes,
  };
}
