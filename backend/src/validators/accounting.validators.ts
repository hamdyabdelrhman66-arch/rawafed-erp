import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => value === "" ? null : value,
  z.string().uuid().optional().nullable(),
);

export const installmentPlan = z.object({
  planType: z.enum(["FULL", "FIFTY_FIFTY", "CUSTOM"]),
  name: z.string().max(160).optional(),
  startDate: z.string().min(8),
  installmentsCount: z.coerce.number().int().positive().max(120),
  gracePeriodDays: z.coerce.number().int().nonnegative().max(365).optional(),
  reminderDays: z.array(z.coerce.number().int().min(-365).max(365)).max(30).optional(),
  allowDuplicateDueDates: z.boolean().optional(),
  autoCalculateFinal: z.boolean().optional(),
  installments: z.array(z.object({
    dueDate: z.string().min(8),
    amount: z.coerce.number().positive().optional(),
    percentage: z.coerce.number().positive().max(100).optional(),
    notes: z.string().max(1000).optional(),
  }).refine((row) => row.amount != null || row.percentage != null, "Amount or percentage is required.")).min(1).max(120),
  notes: z.string().max(4000).optional(),
}).passthrough();

export const manualCustomer = z.object({
  customerType: z.enum(["CHILD", "WORKER"]),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  identityType: z.enum(["NATIONAL_ID", "IQAMA"]),
  nationalId: z.string().regex(/^\d{10}$/),
  nationality: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().email().max(200).optional().or(z.literal("")),
  grade: z.string().trim().max(120).optional(),
  guardianName: z.string().trim().max(200).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(4000).optional(),
  fees: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    category: z.enum(["REGISTRATION", "TUITION", "BOOKS", "UNIFORM", "TRANSPORTATION", "ACTIVITIES", "OTHER_SERVICES"]),
    amount: z.coerce.number().positive().max(100000000),
  })).min(1).max(30),
}).superRefine((value, context) => {
  if (value.customerType === "CHILD" && !value.grade)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grade"], message: "Grade is required for a child." });
  if (value.customerType === "WORKER" && !value.position)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["position"], message: "Position is required for a worker." });
});

export const expense = z.object({
  expenseNo: z.string().max(160).optional(),
  supplierId: optionalUuid,
  expenseAccountId: z.string().uuid(),
  costCenterId: optionalUuid,
  paymentFromAccountId: optionalUuid,
  amountBeforeVat: z.coerce.number().positive().max(100000000),
  vatTreatment: z.enum(["STANDARD", "EXEMPT", "ZERO_RATED", "OUT_OF_SCOPE"]).optional(),
  paymentStatus: z.enum(["Paid", "Partial", "Partially Paid", "Unpaid"]).optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  expenseDate: z.string().min(8),
  dueDate: z.string().min(8).optional().nullable(),
  description: z.string().min(1).max(2000),
  idempotencyKey: z.string().min(8).max(200).optional(),
}).passthrough();

export const expensePayment = z.object({
  amount: z.coerce.number().positive().max(100000000),
  paymentDate: z.string().min(8),
  paymentAccountId: z.string().uuid(),
  paymentMethod: z.string().min(1).max(80),
  referenceNumber: z.string().max(160).optional(),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

const journalLine = z.object({
  accountId: z.string().uuid(),
  debit: z.coerce.number().min(0).max(100000000).optional(),
  credit: z.coerce.number().min(0).max(100000000).optional(),
  description: z.string().max(1000).optional(),
  costCenterId: optionalUuid,
}).refine((line) => Number(line.debit || 0) > 0 !== Number(line.credit || 0) > 0, "Each line must contain either debit or credit.");

export const journalEntry = z.object({
  postingDate: z.string().min(8),
  description: z.string().min(1).max(2000),
  referenceNumber: z.string().max(160).optional(),
  notes: z.string().max(4000).optional(),
  attachmentUrl: z.string().max(2000).optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  recurring: z.boolean().optional(),
  status: z.enum(["DRAFT"]).optional(),
  lines: z.array(journalLine).min(2).max(250),
}).passthrough();

export const journalCorrection = z.object({
  reason: z.string().trim().min(10).max(2000),
  accountingOnly: z.boolean().default(false),
  entry: journalEntry.optional(),
}).strict();

export const accountingPeriod = z.object({
  status: z.enum(["OPEN", "SOFT_CLOSED", "CLOSED"]),
  notes: z.string().max(2000).optional().nullable(),
}).strict();
