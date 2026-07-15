import { z } from "zod";
export const announcement = z
  .object({
    message: z.string().min(3).max(2000),
    targetRoles: z
      .union([
        z.literal("all"),
        z
          .array(
            z.enum([
              "Super Admin",
              "Admissions",
              "Finance",
              "Principal",
              "Registrar",
              "Finance Manager",
              "Chief Accountant",
              "Accountant",
              "Auditor",
            ]),
          )
          .min(1),
      ])
      .default("all"),
    link: z.string().max(500).optional(),
  })
  .strict();
export const staff = z
  .object({
    name: z.string().min(1).max(160),
    nameAr: z.string().max(160).optional(),
    nameEn: z.string().max(160).optional(),
    employeeCode: z.string().max(80).optional(),
    position: z.string().min(1).max(120),
    department: z.string().min(1).max(120),
    phone: z.string().max(40).optional(),
    mobile: z.string().max(40).optional(),
    email: z.string().email().optional().or(z.literal("")),
    salary: z.coerce.number().nonnegative().max(10000000).default(0),
    basicSalary: z.coerce.number().nonnegative().optional(),
    housingAllowance: z.coerce.number().nonnegative().optional(),
    transportationAllowance: z.coerce.number().nonnegative().optional(),
    otherAllowances: z.coerce.number().nonnegative().optional(),
    startDate: z.string().optional(),
    joiningDate: z.string().optional(),
    nationality: z.string().max(80).optional(),
    idNumber: z.string().max(80).optional(),
    nationalId: z.string().max(80).optional(),
    status: z.string().min(1).max(40).default("Active"),
    notes: z.string().max(4000).optional(),
  })
  .passthrough();
const employee = z
  .object({
    employeeId: z.string().uuid(),
    employeeName: z.string().optional(),
    basicSalary: z.coerce.number().nonnegative().default(0),
    housingAllowance: z.coerce.number().nonnegative().default(0),
    transportationAllowance: z.coerce.number().nonnegative().default(0),
    otherAllowances: z.coerce.number().nonnegative().default(0),
    overtime: z.coerce.number().nonnegative().default(0),
    bonus: z.coerce.number().nonnegative().default(0),
    absenceDeduction: z.coerce.number().nonnegative().default(0),
    lateDeduction: z.coerce.number().nonnegative().default(0),
    loanDeduction: z.coerce.number().nonnegative().default(0),
    advanceDeduction: z.coerce.number().nonnegative().default(0),
    gosiEmployee: z.coerce.number().nonnegative().default(0),
    gosiEmployer: z.coerce.number().nonnegative().default(0),
    otherDeductions: z.coerce.number().nonnegative().default(0),
  })
  .strict();
export const payroll = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/),
    paymentDate: z.string().min(8),
    employees: z.array(employee).min(1),
    status: z
      .enum(["Draft", "Submitted", "Approved", "Posted", "Paid"])
      .default("Posted"),
  })
  .strict();
export const payrollPayment = z.object({
  paymentDate: z.string().min(8),
  paymentAccountId: z.string().uuid(),
  paymentMethod: z.string().min(1).max(80),
  referenceNumber: z.string().max(160).optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  idempotencyKey: z.string().min(8).max(200),
}).strict();
