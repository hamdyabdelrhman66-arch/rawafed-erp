export type UserRole =
  | 'Super Admin'
  | 'Admissions'
  | 'Finance'
  | 'Principal'
  | 'Registrar'
  | 'Finance Manager'
  | 'Chief Accountant'
  | 'Accountant'
  | 'Auditor';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  message: string;
  targetRoles: UserRole[] | 'all';
  category: 'registration' | 'finance' | 'admin';
  createdAt: string;
  readBy: UserRole[];
  link?: string;
  sourceId?: string;
}

export interface FinanceAccount {
  id: string;
  registrationId: string;
  registrationNumber: string;
  studentName: string;
  grade: string;
  expectedTotal: number;
  paid: number;
  remaining: number;
  status: 'unpaid' | 'partial' | 'paid';
  feeItems: Array<{ name: string; amount: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface StudentRecord {
  id: string;
  registrationId?: string;
  registrationNumber?: string;
  englishName: string;
  arabicName?: string;
  grade: string;
  nationalId?: string;
  passportNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  status: 'active' | 'inactive' | 'archived';
  profile: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FinancePayment {
  id: string;
  accountId: string;
  registrationId?: string;
  registrationNumber?: string;
  receiptNumber: string;
  paymentItem: string;
  amount: number;
  method: string;
  paidAt: string;
  collectedBy: string;
  referenceNumber?: string;
  notes?: string;
  invoiceId?: string;
  createdAt: string;
}

export interface FinanceInvoice {
  id: string;
  accountId?: string;
  registrationId?: string;
  registrationNumber?: string;
  invoiceNumber: string;
  studentName: string;
  feeItem: string;
  amountBeforeVat: number;
  vat: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  status: 'Pending' | 'Paid';
  issuedAt: string;
  createdAt: string;
}

export interface FinanceExpense {
  id: string;
  category: string;
  title: string;
  amount: number;
  date: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRecord {
  id: string;
  name: string;
  position: string;
  department: string;
  phone?: string;
  email?: string;
  salary: number;
  startDate?: string;
  nationality?: string;
  idNumber?: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileRecord {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  label?: string;
  ownerId?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId?: string;
  actorRole?: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface DatabaseShape {
  users: UserRecord[];
  registrations: any[];
  students: StudentRecord[];
  notifications: AppNotification[];
  financeAccounts: FinanceAccount[];
  financePayments: FinancePayment[];
  financeInvoices: FinanceInvoice[];
  financeExpenses: FinanceExpense[];
  staff: StaffRecord[];
  uploads: UploadedFileRecord[];
  settings: Record<string, unknown>;
  auditLogs: AuditLogRecord[];
  refreshTokens: RefreshTokenRecord[];
}
