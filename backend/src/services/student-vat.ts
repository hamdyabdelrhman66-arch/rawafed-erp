import { createHash } from "node:crypto";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { ServiceError } from "./service.error.js";
import { revenueCategory, type RevenueCategory } from "./revenue-category.js";

export const VAT_DECISION_VERSION = "education-vat-v2";
export type VatTreatment = "STANDARD" | "GOVERNMENT_BORNE" | "EXEMPT" | "ZERO_RATE";
export type IdentityType = "NATIONAL_ID" | "IQAMA";

export interface StudentTaxIdentity {
  identityType?: unknown;
  identityNumber?: unknown;
  nationalId?: unknown;
  nationality?: unknown;
}

export interface VatEligibilityDecision {
  eligible: boolean;
  classification: "SAUDI_CITIZEN" | "NON_SAUDI_RESIDENT";
  identityType: IdentityType;
  identityNumber: string;
  nationality: string;
  reasonCode: string;
  reasonEn: string;
  reasonAr: string;
  version: string;
}

export interface FeePreviewLine {
  name: string;
  category: RevenueCategory;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  chargedVat: number;
  governmentBorneAmount: number;
  parentPayable: number;
  treatment: VatTreatment;
  reasonCode: string;
  reasonEn: string;
  reasonAr: string;
}

export interface FeePreview {
  version: string;
  decisionHash: string;
  eligibility: VatEligibilityDecision;
  lines: FeePreviewLine[];
  subtotal: number;
  totalVat: number;
  chargedVat: number;
  governmentBorneAmount: number;
  parentPayableTotal: number;
  grandTotal: number;
  economicTotal: number;
  messageEn: string;
  messageAr: string;
}

type CategoryPolicy = {
  category: string;
  taxTreatment: string;
  saudiTaxTreatment: string;
  vatRate: unknown;
  active: boolean;
};

export const money = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const SAUDI_NATIONALITIES = new Set([
  "saudi", "saudi arabia", "saudi arabian", "ksa", "kingdom of saudi arabia",
  "سعودي", "سعودية", "السعودية", "المملكة العربية السعودية",
]);

const localizedVatError = (code: string, en: string, ar: string) =>
  new ServiceError(`${en} / ${ar}`, 422, code);

export function resolveVatEligibility(identity: StudentTaxIdentity): VatEligibilityDecision {
  const identityNumber = digits(identity.identityNumber ?? identity.nationalId);
  const nationality = String(identity.nationality ?? "").trim();
  const rawType = normalized(identity.identityType).replace(/[\s-]+/g, "_");
  const identityType = rawType === "national_id" || rawType === "national" || rawType === "هوية_وطنية"
    ? "NATIONAL_ID"
    : rawType === "iqama" || rawType === "residency" || rawType === "إقامة"
      ? "IQAMA"
      : null;

  if (!nationality)
    throw localizedVatError("VAT_NATIONALITY_REQUIRED", "Nationality is required to determine VAT treatment.", "الجنسية مطلوبة لتحديد المعالجة الضريبية.");
  if (!identityType)
    throw localizedVatError("VAT_IDENTITY_TYPE_REQUIRED", "Select National ID or Iqama before calculating VAT.", "اختر نوع الهوية الوطنية أو الإقامة قبل احتساب الضريبة.");
  if (!identityNumber)
    throw localizedVatError("VAT_IDENTITY_NUMBER_REQUIRED", "Identity number is required to determine VAT treatment.", "رقم الهوية مطلوب لتحديد المعالجة الضريبية.");
  if (!/^\d{10}$/.test(identityNumber))
    throw localizedVatError("VAT_IDENTITY_NUMBER_INVALID", "National ID or Iqama must contain exactly 10 digits.", "يجب أن يتكون رقم الهوية أو الإقامة من 10 أرقام بالضبط.");

  const saudiNationality = SAUDI_NATIONALITIES.has(normalized(nationality));
  const startsSaudi = identityNumber.startsWith("1");
  const startsIqama = identityNumber.startsWith("2");
  if (!startsSaudi && !startsIqama)
    throw localizedVatError("VAT_IDENTITY_NUMBER_INVALID", "National ID must start with 1 and Iqama must start with 2.", "يجب أن تبدأ الهوية الوطنية بالرقم 1 والإقامة بالرقم 2.");
  if (identityType === "NATIONAL_ID" && !startsSaudi)
    throw localizedVatError("VAT_IDENTITY_CONFLICT", "National ID type conflicts with the entered number.", "نوع الهوية الوطنية يتعارض مع الرقم المُدخل.");
  if (identityType === "IQAMA" && !startsIqama)
    throw localizedVatError("VAT_IDENTITY_CONFLICT", "Iqama type conflicts with the entered number.", "نوع الإقامة يتعارض مع الرقم المُدخل.");
  if (saudiNationality !== startsSaudi)
    throw localizedVatError("VAT_NATIONALITY_CONFLICT", "Nationality conflicts with the validated identity number.", "الجنسية تتعارض مع رقم الهوية الذي تم التحقق منه.");

  return startsSaudi
    ? {
        eligible: true,
        classification: "SAUDI_CITIZEN",
        identityType: "NATIONAL_ID",
        identityNumber,
        nationality,
        reasonCode: "SAUDI_NATIONAL_ID_VERIFIED",
        reasonEn: "Saudi citizenship verified from nationality and a valid National ID starting with 1.",
        reasonAr: "تم التحقق من الجنسية السعودية والهوية الوطنية الصحيحة التي تبدأ بالرقم 1.",
        version: VAT_DECISION_VERSION,
      }
    : {
        eligible: false,
        classification: "NON_SAUDI_RESIDENT",
        identityType: "IQAMA",
        identityNumber,
        nationality,
        reasonCode: "NON_SAUDI_IQAMA_VERIFIED",
        reasonEn: "Non-Saudi residency verified from nationality and a valid Iqama starting with 2.",
        reasonAr: "تم التحقق من صفة المقيم غير السعودي والإقامة الصحيحة التي تبدأ بالرقم 2.",
        version: VAT_DECISION_VERSION,
      };
}

const treatment = (value: unknown): VatTreatment => {
  const candidate = String(value ?? "STANDARD").toUpperCase();
  if (["STANDARD", "GOVERNMENT_BORNE", "EXEMPT", "ZERO_RATE"].includes(candidate)) return candidate as VatTreatment;
  throw localizedVatError("VAT_CONFIGURATION_INVALID", `Unsupported VAT treatment: ${candidate}.`, `معالجة ضريبية غير مدعومة: ${candidate}.`);
};

export function calculateFeePreview(
  identity: StudentTaxIdentity,
  feeInputs: Array<{ name: string; category?: unknown; amount: unknown }>,
  policies: CategoryPolicy[],
): FeePreview {
  const eligibility = resolveVatEligibility(identity);
  const lines = feeInputs.filter((item) => money(item.amount) > 0).map((item): FeePreviewLine => {
    const category = revenueCategory(item.category ?? item.name);
    const policy = policies.find((row) => row.active && row.category === category);
    if (!policy)
      throw localizedVatError("VAT_CONFIGURATION_MISSING", `VAT policy is not configured for ${category}.`, `لم يتم إعداد السياسة الضريبية لفئة ${category}.`);
    const appliedTreatment = treatment(eligibility.eligible ? policy.saudiTaxTreatment : policy.taxTreatment);
    const subtotal = money(item.amount);
    const vatRate = appliedTreatment === "EXEMPT" || appliedTreatment === "ZERO_RATE" ? 0 : money(policy.vatRate);
    const vatAmount = money(subtotal * vatRate / 100);
    const governmentBorneAmount = appliedTreatment === "GOVERNMENT_BORNE" ? vatAmount : 0;
    const chargedVat = appliedTreatment === "STANDARD" ? vatAmount : 0;
    const reasonCode = appliedTreatment === "GOVERNMENT_BORNE"
      ? "SAUDI_EDUCATION_VAT_GOVERNMENT_BORNE"
      : appliedTreatment === "STANDARD" ? "STANDARD_RATE_APPLIED" : `VAT_${appliedTreatment}`;
    return {
      name: item.name,
      category,
      subtotal,
      vatRate,
      vatAmount,
      chargedVat,
      governmentBorneAmount,
      parentPayable: money(subtotal + chargedVat),
      treatment: appliedTreatment,
      reasonCode,
      reasonEn: appliedTreatment === "GOVERNMENT_BORNE"
        ? "VAT on this eligible educational service is borne by the Saudi government and is not charged to the parent."
        : appliedTreatment === "STANDARD" ? `VAT is charged to the parent at ${vatRate}%.` : `This service is ${appliedTreatment.toLowerCase().replace("_", " ")}.`,
      reasonAr: appliedTreatment === "GOVERNMENT_BORNE"
        ? "تتحمل الدولة ضريبة القيمة المضافة على هذه الخدمة التعليمية المؤهلة ولا تُحمّل على ولي الأمر."
        : appliedTreatment === "STANDARD" ? `تُحمّل ضريبة القيمة المضافة على ولي الأمر بنسبة ${vatRate}٪.` : "هذه الخدمة معفاة أو خاضعة لنسبة صفرية حسب الإعداد المعتمد.",
    };
  });
  const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const totalVat = money(lines.reduce((sum, line) => sum + line.vatAmount, 0));
  const chargedVat = money(lines.reduce((sum, line) => sum + line.chargedVat, 0));
  const governmentBorneAmount = money(lines.reduce((sum, line) => sum + line.governmentBorneAmount, 0));
  const parentPayableTotal = money(subtotal + chargedVat);
  const snapshot = { version: VAT_DECISION_VERSION, eligibility, lines, subtotal, totalVat, chargedVat, governmentBorneAmount, parentPayableTotal };
  const decisionHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return {
    ...snapshot,
    decisionHash,
    grandTotal: parentPayableTotal,
    economicTotal: money(subtotal + totalVat),
    messageEn: governmentBorneAmount > 0
      ? "VAT on eligible educational services is borne by the Saudi government and is not added to the parent payable total."
      : "VAT has been calculated from the validated identity and configured service-category rules.",
    messageAr: governmentBorneAmount > 0
      ? "تتحمل الدولة ضريبة القيمة المضافة على الخدمات التعليمية المؤهلة ولا تضاف إلى إجمالي المبلغ المستحق على ولي الأمر."
      : "تم احتساب الضريبة بناءً على بيانات الهوية التي تم التحقق منها وقواعد فئات الخدمات المعتمدة.",
  };
}

export async function authoritativeFeePreviewUsing(
  tx: DatabaseClient,
  input: { student?: Record<string, unknown>; financial?: Record<string, unknown> },
): Promise<FeePreview> {
  const financial = input.financial || {};
  const feeInputs = [
    ["Registration Fee", "REGISTRATION", financial.registrationFee],
    ["Tuition", "TUITION", financial.tuition],
    ["Books", "BOOKS", financial.books],
    ["Uniform", "UNIFORM", financial.uniform],
    ["Activities", "ACTIVITIES", financial.activities],
    ["Transportation", "TRANSPORTATION", financial.transportationRequired ? financial.transportationFee : 0],
  ].map(([name, category, amount]) => ({ name: String(name), category, amount }));
  const policies = await tx.revenueCategoryMapping.findMany({ where: { active: true } });
  return calculateFeePreview({
    identityType: input.student?.identityType,
    identityNumber: input.student?.nationalId,
    nationality: input.student?.nationality,
  }, feeInputs, policies as CategoryPolicy[]);
}

// Compatibility helpers are deliberately narrow. New write flows must call the
// authoritative service above because nationality and identity type are required.
export const isSaudiNationalId = (nationalId: unknown) => /^1\d{9}$/.test(digits(nationalId));
export const vatRateForStudent = (nationalId: unknown) => isSaudiNationalId(nationalId) ? 0 : 15;
export const vatForSubtotal = (subtotal: unknown, nationalId: unknown) => money(money(subtotal) * vatRateForStudent(nationalId) / 100);

export async function recalculateStudentVatUsing(
  tx: DatabaseClient,
  studentId: string,
  identity: StudentTaxIdentity,
) {
  const account = await tx.financeAccount.findUnique({
    where: { studentId },
    include: {
      registration: true,
      feeItems: true,
      payments: { where: { status: "COMPLETED", deletedAt: null } },
      invoices: { where: { deletedAt: null, status: { not: "VOID" } } },
    },
  });
  const customer = await tx.accountingCustomer.findUnique({ where: { studentId } });
  if (account?.payments.length)
    throw localizedVatError("VAT_IDENTITY_LOCKED_AFTER_PAYMENT", "Identity tax fields cannot be changed after a payment is posted without an authorized correction workflow.", "لا يمكن تغيير بيانات الهوية الضريبية بعد ترحيل دفعة إلا من خلال مسار تصحيح معتمد.");
  if (account?.invoices.length)
    throw localizedVatError("VAT_OPERATIONAL_CORRECTION_REQUIRED", "Cancel and reissue the unpaid invoice through the operational correction workflow before changing VAT identity fields.", "يجب إلغاء الفاتورة غير المدفوعة وإعادة إصدارها من خلال مسار التصحيح التشغيلي قبل تغيير بيانات الهوية الضريبية.");
  resolveVatEligibility(identity);
  if (!account) {
    if (customer) await tx.accountingCustomer.update({ where: { id: customer.id }, data: { nationalId: String(identity.identityNumber ?? identity.nationalId ?? "") || null } });
    return { recalculated: false, reviewRequired: false };
  }
  const policies = await tx.revenueCategoryMapping.findMany({ where: { active: true } });
  const preview = calculateFeePreview(
    identity,
    account.feeItems.map((item) => ({ name: item.name, category: item.serviceCategory, amount: item.subtotal ?? item.amount })),
    policies as CategoryPolicy[],
  );
  for (const item of account.feeItems) {
    const line = preview.lines.find((candidate) => candidate.name === item.name && candidate.category === revenueCategory(item.serviceCategory || item.name));
    if (!line) continue;
    await tx.financeAccountFeeItem.update({
      where: { id: item.id },
      data: {
        subtotal: line.subtotal,
        vatRate: line.vatRate,
        vatAmount: line.chargedVat,
        governmentBorneVat: line.governmentBorneAmount,
        taxTreatment: line.treatment,
        taxReason: line.reasonCode,
        amount: line.parentPayable,
      },
    });
  }
  await tx.financeAccount.update({ where: { id: account.id }, data: { expectedTotal: preview.parentPayableTotal } });
  if (customer) await tx.accountingCustomer.update({ where: { id: customer.id }, data: { nationalId: preview.eligibility.identityNumber } });
  const registrationData = account.registration.data as Record<string, any>;
  await tx.registration.update({
    where: { id: account.registrationId },
    data: {
      data: {
        ...registrationData,
        student: { ...(registrationData.student || {}), nationality: preview.eligibility.nationality, identityType: preview.eligibility.identityType, nationalId: preview.eligibility.identityNumber },
        financial: {
          ...(registrationData.financial || {}),
          subtotal: preview.subtotal,
          vat: preview.chargedVat,
          vatAmount: preview.chargedVat,
          totalVat: preview.totalVat,
          governmentBorneAmount: preview.governmentBorneAmount,
          parentPayableTotal: preview.parentPayableTotal,
          grandTotal: preview.grandTotal,
          taxDecisionHash: preview.decisionHash,
          taxDecision: preview,
        },
      },
    },
  });
  return { recalculated: true, reviewRequired: false, preview };
}
