import bcrypt from "bcryptjs";
import { AccountType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const branch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: {
      code: "MAIN",
      name: "Rawafed Main Campus",
      nameAr: "حرم روافد الرئيسي",
    },
  });

  await prisma.academicYear.upsert({
    where: { branchId_name: { branchId: branch.id, name: "2026-2027" } },
    update: {},
    create: {
      branchId: branch.id,
      name: "2026-2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-07-31"),
      active: true,
    },
  });

  const roleNames = [
    "Super Admin",
    "Admissions",
    "Finance",
    "Principal",
    "Registrar",
    "Finance Manager",
    "Chief Accountant",
    "Accountant",
    "Auditor",
  ];
  for (const name of roleNames)
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "Super Admin" },
  });
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (password) {
    await prisma.user.upsert({
      where: { username: "admin" },
      update: {},
      create: {
        username: "admin",
        displayName: "System Administrator",
        passwordHash: await bcrypt.hash(password, 12),
        roleId: adminRole.id,
      },
    });
  }

  const accounts: Array<
    [string, string, AccountType, string, Record<string, boolean>?]
  > = [
    ["1100", "Cash", AccountType.ASSET, "cash-main", { isCashAccount: true }],
    ["1110", "Bank", AccountType.ASSET, "bank-main", { isBankAccount: true }],
    [
      "1200",
      "Accounts Receivable",
      AccountType.ASSET,
      "accounts-receivable",
      { isReceivableAccount: true },
    ],
    [
      "2100",
      "VAT Payable",
      AccountType.LIABILITY,
      "vat-payable",
      { isVatAccount: true },
    ],
    [
      "2200",
      "Accounts Payable",
      AccountType.LIABILITY,
      "accounts-payable",
      { isPayableAccount: true },
    ],
    ["3100", "Retained Earnings", AccountType.EQUITY, "retained-earnings"],
    ["4100", "Tuition Revenue", AccountType.REVENUE, "tuition-revenue"],
    ["1155", "Government VAT Receivable", AccountType.ASSET, "government-vat-receivable"],
    ["5100", "Operating Expenses", AccountType.EXPENSE, "operating-expenses"],
    [
      "1150",
      "Input VAT",
      AccountType.ASSET,
      "vat-input",
      { isVatAccount: true },
    ],
    ["5200", "Salaries Expense", AccountType.EXPENSE, "expense-salaries"],
    [
      "5210",
      "Social Insurance Expense",
      AccountType.EXPENSE,
      "expense-social-insurance",
    ],
    ["2250", "Salaries Payable", AccountType.LIABILITY, "salaries-payable"],
  ];
  for (const [code, name, type, systemKey, flags = {}] of accounts)
    await prisma.chartOfAccount.upsert({
      where: { code },
      update: { systemKey, ...flags },
      create: { code, name, type, systemKey, system: true, ...flags },
    });

  await prisma.vatRate.upsert({
    where: { code: "SA_STANDARD" },
    update: {},
    create: {
      code: "SA_STANDARD",
      name: "Saudi standard VAT",
      rate: 15,
      validFrom: new Date("2020-07-01"),
    },
  });
  for (const [key, value] of [
    ["currency", "SAR"],
    ["timezone", "Asia/Riyadh"],
    ["locale", "ar-SA"],
  ] as const) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}

main().finally(() => prisma.$disconnect());
