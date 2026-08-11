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

  const permissions: Array<[string, string]> = [
    ["accounting.periods.manage", "accounting"],
    ["finance.invoices.exportPdf", "finance"],
    ["finance.invoices.print", "finance"],
    ["finance.invoices.view", "finance"],
    ["finance.payments.record", "finance"],
    ["finance.receipts.view", "finance"],
    ["journals.cancel.draft", "accounting"],
    ["journals.correct.posted", "accounting"],
    ["journals.create.manual", "accounting"],
    ["journals.delete.permanent", "accounting"],
    ["journals.edit.draft", "accounting"],
    ["journals.post", "accounting"],
    ["journals.reverse", "accounting"],
    ["journals.submit", "accounting"],
    ["journals.view", "accounting"],
    ["security.alerts.manage", "security"],
    ["security.audit.view", "security"],
    ["security.loginAttempts.view", "security"],
    ["security.permissions.manage", "security"],
    ["security.sessions.revoke", "security"],
    ["security.sessions.view", "security"],
    ["security.settings.manage", "security"],
    ["student_discount.approve", "finance"],
    ["student_discount.cancel", "finance"],
    ["student_discount.create", "finance"],
    ["student_discount.view", "finance"],
    ["students.archive", "students"],
    ["students.audit.view", "students"],
    ["students.delete", "students"],
    ["students.delete.permanent", "students"],
    ["students.edit", "students"],
    ["students.edit.financeData", "students"],
    ["students.edit.identity", "students"],
    ["students.restore", "students"],
  ];
  for (const [code, module] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { module },
      create: { code, module },
    });
  }

  const grants: Record<string, string[]> = {
    "Super Admin": permissions.map(([code]) => code),
    "Finance Manager": permissions
      .map(([code]) => code)
      .filter((code) => !code.startsWith("security.") && !code.startsWith("students.delete.permanent")),
    "Chief Accountant": [
      "accounting.periods.manage", "finance.invoices.exportPdf", "finance.invoices.print",
      "finance.invoices.view", "finance.payments.record", "finance.receipts.view",
      "journals.cancel.draft", "journals.correct.posted", "journals.create.manual",
      "journals.delete.permanent", "journals.edit.draft", "journals.post", "journals.reverse", "journals.submit",
      "journals.view", "student_discount.approve", "student_discount.cancel",
      "student_discount.create", "student_discount.view", "students.edit.financeData",
    ],
    Finance: [
      "finance.invoices.exportPdf", "finance.invoices.print", "finance.invoices.view",
      "finance.payments.record", "finance.receipts.view", "journals.cancel.draft",
      "journals.create.manual", "journals.delete.permanent", "journals.edit.draft", "journals.post", "journals.submit", "journals.view",
      "student_discount.create", "student_discount.view",
    ],
    Accountant: [
      "finance.invoices.exportPdf", "finance.invoices.print", "finance.invoices.view",
      "finance.payments.record", "finance.receipts.view", "journals.cancel.draft",
      "journals.create.manual", "journals.delete.permanent", "journals.edit.draft", "journals.post", "journals.submit", "journals.view",
      "student_discount.create", "student_discount.view",
    ],
    Auditor: [
      "finance.invoices.exportPdf", "finance.invoices.print", "finance.invoices.view",
      "finance.receipts.view", "journals.view", "student_discount.view", "security.audit.view",
    ],
    Admissions: [
      "students.archive", "students.audit.view", "students.delete", "students.edit",
      "students.edit.identity", "students.restore",
    ],
    Registrar: ["students.audit.view", "students.edit"],
    Principal: ["students.archive", "students.audit.view", "students.edit", "students.restore"],
  };
  for (const [roleName, codes] of Object.entries(grants)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const granted = await prisma.permission.findMany({ where: { code: { in: codes } } });
    await prisma.rolePermission.createMany({
      data: granted.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

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
    ["4110", "Registration Revenue", AccountType.REVENUE, "registration-revenue"],
    ["4120", "Books Revenue", AccountType.REVENUE, "books-revenue"],
    ["4130", "Uniform Revenue", AccountType.REVENUE, "uniform-revenue"],
    ["4140", "Transportation Revenue", AccountType.REVENUE, "transportation-revenue"],
    ["4150", "Activities Revenue", AccountType.REVENUE, "activities-revenue"],
    ["4190", "Other Services Revenue", AccountType.REVENUE, "other-services-revenue"],
    ["1155", "Government VAT Receivable", AccountType.ASSET, "government-vat-receivable"],
    ["1300", "Inventory", AccountType.ASSET, "inventory-main"],
    ["5100", "Operating Expenses", AccountType.EXPENSE, "operating-expenses"],
    ["5110", "Cost of Books Sold", AccountType.EXPENSE, "books-cost"],
    ["5120", "Cost of Uniform Sold", AccountType.EXPENSE, "uniform-cost"],
    ["5130", "Transportation Costs", AccountType.EXPENSE, "transportation-cost"],
    ["5140", "Activity Costs", AccountType.EXPENSE, "activities-cost"],
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

  // These mappings are operational configuration, not optional demo data.
  // Upsert them on every deployment so a removed/disabled category cannot make
  // student creation fail with VAT_CONFIGURATION_MISSING.  Rawafed's approved
  // rule is that a verified Saudi National ID (prefix 1) is not charged VAT.
  const accountByKey = new Map(
    (await prisma.chartOfAccount.findMany({
      where: {
        systemKey: { in: [
          "accounts-receivable", "inventory-main", "registration-revenue",
          "tuition-revenue", "books-revenue", "uniform-revenue",
          "transportation-revenue", "activities-revenue", "other-services-revenue",
          "books-cost", "uniform-cost", "transportation-cost", "activities-cost",
        ] },
        deletedAt: null,
      },
    })).map((account) => [account.systemKey, account]),
  );
  const receivableAccount = accountByKey.get("accounts-receivable");
  if (!receivableAccount) throw new Error("Accounts receivable control account is missing during seed.");
  const inventoryAccount = accountByKey.get("inventory-main");
  const revenueMappings: Array<[string, string, string?]> = [
    ["REGISTRATION", "registration-revenue"],
    ["TUITION", "tuition-revenue"],
    ["BOOKS", "books-revenue", "books-cost"],
    ["UNIFORM", "uniform-revenue", "uniform-cost"],
    ["TRANSPORTATION", "transportation-revenue", "transportation-cost"],
    ["ACTIVITIES", "activities-revenue", "activities-cost"],
    ["OTHER_SERVICES", "other-services-revenue"],
  ];
  for (const [category, revenueKey, costKey] of revenueMappings) {
    const revenueAccount = accountByKey.get(revenueKey);
    if (!revenueAccount) throw new Error(`Revenue account ${revenueKey} is missing during seed.`);
    await prisma.revenueCategoryMapping.upsert({
      where: { category },
      update: {
        revenueAccountId: revenueAccount.id,
        costAccountId: costKey ? accountByKey.get(costKey)?.id : null,
        receivableAccountId: receivableAccount.id,
        inventoryAccountId: ["BOOKS", "UNIFORM"].includes(category) ? inventoryAccount?.id : null,
        taxTreatment: "STANDARD",
        saudiTaxTreatment: "EXEMPT",
        vatRate: 15,
        active: true,
      },
      create: {
        category,
        revenueAccountId: revenueAccount.id,
        costAccountId: costKey ? accountByKey.get(costKey)?.id : null,
        receivableAccountId: receivableAccount.id,
        inventoryAccountId: ["BOOKS", "UNIFORM"].includes(category) ? inventoryAccount?.id : null,
        taxTreatment: "STANDARD",
        saudiTaxTreatment: "EXEMPT",
        vatRate: 15,
        active: true,
      },
    });
  }

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
  await prisma.costCenter.upsert({
    where: { code: "ADMIN" },
    update: { active: true },
    create: {
      code: "ADMIN",
      nameAr: "الإدارة العامة",
      nameEn: "General Administration",
    },
  });
  const warehouse = await prisma.warehouse.upsert({
    where: { code: "MAIN" },
    update: { active: true },
    create: {
      code: "MAIN",
      name: "Main Warehouse",
      nameAr: "المخزن الرئيسي",
      location: "Rawafed Main Campus",
    },
  });
  await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: "DEFAULT" } },
    update: { active: true },
    create: {
      warehouseId: warehouse.id,
      code: "DEFAULT",
      name: "Default Location",
    },
  });
  for (const [key, value] of [
    ["currency", "SAR"],
    ["timezone", "Asia/Riyadh"],
    ["locale", "ar-SA"],
    ["school", {
      nameAr: "مدارس روافد العالمية",
      nameEn: "Rawafed International School",
      addressAr: "الرياض، حي الخليج، شارع بحر العرب",
      addressEn: "Riyadh, Al Khaleej District, Bahr Al Arab Street",
      logoUrl: "/assets/rawafed-logo.png",
    }],
    ["finance", { currency: "SAR", vatRate: 15, decimalPlaces: 2 }],
  ] as const) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}

main().finally(() => prisma.$disconnect());
