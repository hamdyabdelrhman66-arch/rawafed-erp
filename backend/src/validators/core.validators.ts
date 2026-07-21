import { z } from "zod";

export const login = z.object({ username: z.string(), password: z.string() });
export const strongPassword = z.string().min(12).max(128);
const role = z.enum([
  "Super Admin",
  "Admissions",
  "Finance",
  "Principal",
  "Registrar",
  "Finance Manager",
  "Chief Accountant",
  "Accountant",
  "Auditor",
]);
export const createUser = z.object({
  username: z
    .string()
    .min(3)
    .max(60)
    .transform((v) => v.trim().toLowerCase()),
  password: strongPassword,
  email: z.string().trim().email().optional().or(z.literal("")),
  displayName: z.string().min(2).max(120),
  employeeCode: z.string().trim().min(2).max(40).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  department: z.string().trim().max(100).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(100).optional().or(z.literal("")),
  role,
});
export const updateUser = z
  .object({
    displayName: z.string().min(2).max(120).optional(),
    email: z.string().trim().email().nullable().optional().or(z.literal("")),
    employeeCode: z.string().trim().max(40).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    department: z.string().trim().max(100).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    role: role.optional(),
  })
  .strict();
export const password = z.object({ password: strongPassword }).strict();
export const activeStatus = z.object({ active: z.boolean() }).strict();
export const studentPatch = z
  .object({
    englishName: z.string().min(1).max(160).optional(),
    arabicName: z.string().max(160).optional(),
    grade: z.string().min(1).max(40).optional(),
    nationalId: z.string().max(40).optional(),
    nationality: z.string().trim().min(1).max(80).optional(),
    identityType: z.enum(["NATIONAL_ID", "IQAMA"]).optional(),
    passportNumber: z.string().max(40).optional(),
    parentName: z.string().max(160).optional(),
    parentPhone: z.string().max(40).optional(),
    parentEmail: z.string().email().optional().or(z.literal("")),
    status: z.enum(["active", "inactive", "archived"]).optional(),
    gender: z.string().max(40).optional(),
    dateOfBirth: z.string().date().optional(),
    academicYear: z.string().max(80).optional(),
    className: z.string().max(80).optional(),
    address: z.record(z.unknown()).optional(),
    guardian: z.record(z.unknown()).optional(),
    emergencyContact: z.record(z.unknown()).optional(),
    medical: z.record(z.unknown()).optional(),
    documents: z.array(z.record(z.unknown())).optional(),
    transportationRequest: z.record(z.unknown()).optional(),
    paymentPlan: z.string().max(80).optional(),
    notes: z.string().max(4000).optional(),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();
export const studentReason = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
export const permanentStudentDelete = z.object({
  reason: z.string().trim().min(3).max(1000),
  confirmation: z.string().trim().min(1).max(200),
}).strict();
export const settings = z.record(z.string().max(100), z.unknown());
export const refresh = z.object({ refreshToken: z.string().min(20) });
export const registration = z
  .object({
    id: z.string().uuid().optional(),
    registrationNumber: z.string().optional(),
    status: z
      .enum(["draft", "pending", "approved", "rejected", "archived"])
      .optional(),
    submittedAt: z.string().optional(),
    createdAt: z.string().optional(),
    student: z
      .object({
        englishName: z.string().optional().default(""),
        arabicName: z.string().optional().default(""),
        applyingGrade: z.string().optional().default(""),
        nationality: z.string().trim().min(1).max(80),
        identityType: z.enum(["NATIONAL_ID", "IQAMA"]),
        nationalId: z.string().optional().default(""),
        passportNumber: z.string().optional().default(""),
      })
      .passthrough(),
    father: z.record(z.any()).optional(),
    mother: z.record(z.any()).optional(),
    financial: z.record(z.any()).optional(),
  })
  .passthrough();
export const registrationFeePreview = registration.pick({ student: true, financial: true });
export const status = z.object({
  status: z.enum(["draft", "pending", "approved", "rejected", "archived"]),
});
export const payment = z
  .object({
    accountId: z.string().uuid(),
    invoiceId: z.string().uuid().optional(),
    installmentId: z.string().uuid().optional(),
    receiptNumber: z.string().max(80).optional(),
    paymentItem: z.string().max(160).default("School Fees"),
    amount: z.coerce.number().positive().max(10000000),
    method: z.string().max(60).default("Cash"),
    paidAt: z
      .union([z.string().date(), z.string().datetime()])
      .optional(),
    referenceNumber: z.string().max(120).optional(),
    notes: z.string().max(2000).optional(),
    lines: z
      .array(
        z
          .object({
            feeItem: z.string().trim().min(1).max(160),
            amount: z.coerce.number().positive().max(10000000),
          })
          .strict(),
      )
      .min(1)
      .optional(),
  })
  .strict();
export const invoice = z.object({
  id: z.union([z.string().uuid(), z.number()]).optional(),
  accountId: z.union([z.string().uuid(), z.number()]).optional(),
  registrationId: z.string().uuid().optional(),
  registrationNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  patient: z.string().optional(),
  studentName: z.string().optional(),
  feeItem: z.string().optional(),
  service: z.string().optional(),
  amountBeforeVat: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  vat: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  paid: z.coerce.number().optional(),
  remaining: z.coerce.number().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(["Pending", "Paid"]).optional(),
  date: z.string().optional(),
});
