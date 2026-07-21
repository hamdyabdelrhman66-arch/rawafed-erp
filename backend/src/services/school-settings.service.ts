import type { DatabaseClient } from "../repositories/repository.types.js";

export interface SchoolProfile {
  nameAr: string;
  nameEn: string;
  addressAr: string;
  addressEn: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  vatNumber: string | null;
  commercialRegistration: string | null;
  logoUrl: string;
  invoiceFooterAr: string | null;
  invoiceFooterEn: string | null;
}

export const RAWAFED_SCHOOL_DEFAULTS: SchoolProfile = {
  nameAr: "مدارس روافد العالمية",
  nameEn: "Rawafed International School",
  addressAr: "الرياض، حي الخليج، شارع بحر العرب",
  addressEn: "Riyadh, Al Khaleej District, Bahr Al Arab Street",
  phone: null,
  email: null,
  website: null,
  vatNumber: null,
  commercialRegistration: null,
  logoUrl: "/assets/rawafed-logo.png",
  invoiceFooterAr: null,
  invoiceFooterEn: null,
};

export async function schoolProfileUsing(db: DatabaseClient): Promise<SchoolProfile> {
  const keys = [
    "school", "schoolInfo", "schoolName", "schoolNameAr", "addressAr", "addressEn", "address",
    "phone", "email", "website", "vatNumber", "commercialRegistration", "logoDataUrl", "invoiceFooter",
    "school_name", "school_address", "school_phone", "school_email", "vat_number", "commercial_registration",
  ];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, any>;
  const school = (values.school || values.schoolInfo || {}) as Record<string, any>;
  return {
    nameAr: school.nameAr || values.schoolNameAr || RAWAFED_SCHOOL_DEFAULTS.nameAr,
    nameEn: school.nameEn || values.schoolName || values.school_name || RAWAFED_SCHOOL_DEFAULTS.nameEn,
    addressAr: school.addressAr || values.addressAr || RAWAFED_SCHOOL_DEFAULTS.addressAr,
    addressEn: school.addressEn || values.addressEn || values.address || values.school_address || RAWAFED_SCHOOL_DEFAULTS.addressEn,
    phone: school.phone || values.phone || values.school_phone || null,
    email: school.email || values.email || values.school_email || null,
    website: school.website || values.website || null,
    vatNumber: school.vatNumber || values.vatNumber || values.vat_number || null,
    commercialRegistration: school.commercialRegistration || values.commercialRegistration || values.commercial_registration || null,
    logoUrl: school.logoUrl || values.logoDataUrl || RAWAFED_SCHOOL_DEFAULTS.logoUrl,
    invoiceFooterAr: school.invoiceFooterAr || values.invoiceFooter?.ar || null,
    invoiceFooterEn: school.invoiceFooterEn || values.invoiceFooter?.en || null,
  };
}
