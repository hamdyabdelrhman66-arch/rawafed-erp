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
  notificationStatus?: "new" | "seen";
  discountPercent?: number;
  registrationId?: string;
  registrationNumber?: string;
  backendId?: string;
  canonicalInvoiceId?: string;
  subtotal?: number;
  vat?: number;
  vatExempt?: boolean;
  nationalId?: string;
}

export interface FinanceFeeItem {
  service: string;
  sessions: number;
  price: number;
  customPrice: boolean;
  paid?: number;
  remaining?: number;
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
  registrationNumber?: string;
}

export interface FinanceInvoice {
  id: number;
  invoiceNumber: string;
  patient: string;
  service: string;
  amount: number;
  discount?: number;
  vat?: number;
  total?: number;
  date: string;
  status: "Pending" | "Paid";
  paid?: number;
  remaining?: number;
  paymentMethod?: string;
  receipt?: string;
  taxNumber?: string;
  patientId?: string;
  fileNo?: string;
  notes?: string;
  user?: string;
  vatExempt?: boolean;
  registrationId?: string;
  registrationNumber?: string;
  accountId?: number | string;
  feeItem?: string;
}

export interface FinanceExpense {
  id: number;
  category: string;
  title: string;
  amount: number;
  date: string;
  status: string;
  notes?: string;
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
