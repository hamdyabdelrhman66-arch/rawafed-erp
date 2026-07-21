import type { UserRole } from "../types.js";

export interface Actor {
  id?: string;
  displayName?: string;
  role?: UserRole;
}
export interface RegistrationInput {
  id?: string;
  registrationNumber?: string;
  status?: string;
  submittedAt?: string;
  createdAt?: string;
  student: Record<string, any>;
  father?: Record<string, any>;
  mother?: Record<string, any>;
  financial?: Record<string, any>;
  [key: string]: any;
}
export interface PaymentInput {
  accountId: string;
  invoiceId?: string;
  installmentId?: string;
  receiptNumber?: string;
  paymentItem?: string;
  amount: number;
  method?: string;
  paidAt?: string;
  referenceNumber?: string;
  notes?: string;
  lines?: Array<{ feeItem: string; amount: number }>;
}
