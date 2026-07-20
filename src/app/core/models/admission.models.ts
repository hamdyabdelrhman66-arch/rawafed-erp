export type Direction = 'ltr' | 'rtl';
export type AdmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type PriorityLevel = 'normal' | 'high' | 'urgent';
export type PaymentPlan = 'Full Payment' | '50/50' | 'Custom Installments';

export const GRADE_LEVELS = ['Pre-KG', 'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export interface UploadedDocument {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  uploadUrl?: string;
  backendId?: string;
  verified: boolean;
  uploadedAt: string;
}

export interface PersonInfo {
  fullName: string;
  occupation: string;
  company: string;
  nationality: string;
  idNumber: string;
  phone: string;
  email: string;
}

export interface AddressInfo {
  country: string;
  city: string;
  district: string;
  street: string;
  building: string;
  zipCode: string;
  mapLocation: string;
}

export interface StudentInfo {
  englishName: string;
  arabicName: string;
  applyingGrade: string;
  nationality: string;
  identityType: 'NATIONAL_ID' | 'IQAMA';
  religion: string;
  nationalId: string;
  passportNumber: string;
  dateOfBirth: string;
  gender: string;
  previousSchool: string;
}

export interface EmergencyInfo {
  contactName: string;
  relationship: string;
  phone: string;
  alternativePhone: string;
}

export interface MedicalInfo {
  bloodType: string;
  allergies: string;
  medicalConditions: string;
  medication: string;
  primaryPhysician: string;
  hospital: string;
  doctorPhone: string;
  insuranceCompany: string;
  insuranceNumber: string;
  specialNotes: string;
}

export interface FinancialInfo {
  registrationFee: number;
  tuition: number;
  books: number;
  uniform: number;
  activities: number;
  transportationRequired: boolean;
  transportationArea: string;
  transportationFee: number;
  vat: number;
  vatAmount?: number;
  totalVat?: number;
  governmentBorneAmount?: number;
  subtotal?: number;
  parentPayableTotal?: number;
  taxDecisionHash?: string;
  taxDecision?: RegistrationFeePreview;
  paymentPlan: PaymentPlan;
  grandTotal: number;
  paymentStatus: PaymentStatus;
}

export interface RegistrationFeePreviewLine {
  name: string;
  category: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  chargedVat: number;
  governmentBorneAmount: number;
  parentPayable: number;
  treatment: 'STANDARD' | 'GOVERNMENT_BORNE' | 'EXEMPT' | 'ZERO_RATE';
  reasonCode: string;
  reasonEn: string;
  reasonAr: string;
}

export interface RegistrationFeePreview {
  version: string;
  decisionHash: string;
  eligibility: {
    eligible: boolean;
    classification: 'SAUDI_CITIZEN' | 'NON_SAUDI_RESIDENT';
    reasonCode: string;
    reasonEn: string;
    reasonAr: string;
  };
  lines: RegistrationFeePreviewLine[];
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

export interface GradeFeeSettings {
  registrationFee: number;
  tuition: number;
  books: number;
  uniform: number;
  activities: number;
  vat: number;
}

export interface TransportationArea {
  id: string;
  name: string;
  annualFee: number;
}

export interface AdmissionLetterRequest {
  recipientSchool: string;
  studentName: string;
  grade: string;
  notes: string;
  recipientEmail: string;
}

export interface AgreementInfo {
  scrolledToEnd: boolean;
  accepted: boolean;
  acceptedAt: string;
}

export interface SignatureInfo {
  parentSignature: string;
  studentSignature: string;
  signedDate: string;
}

export interface AdmissionRegistration {
  id: string;
  registrationNumber: string;
  status: AdmissionStatus;
  priority: PriorityLevel;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  student: StudentInfo;
  father: PersonInfo;
  mother: PersonInfo;
  address: AddressInfo;
  emergency: EmergencyInfo;
  medical: MedicalInfo;
  financial: FinancialInfo;
  agreement: AgreementInfo;
  signatures: SignatureInfo;
  documents: UploadedDocument[];
  contractPdf?: UploadedDocument;
  registrationInfoPdf?: UploadedDocument;
  notes: string;
  internalComments: string;
  tags: string[];
  timeline: TimelineEvent[];
  qrDataUrl?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
}

export interface SchoolSettings {
  schoolName: string;
  schoolNameAr: string;
  logoDataUrl: string;
  address: string;
  phone: string;
  email: string;
  academicYear: string;
  vat: number;
  fees: Record<string, number>;
  gradeFees: Record<GradeLevel, GradeFeeSettings>;
  transportationAreas: TransportationArea[];
  paymentPlans: string[];
  contractPdf?: UploadedDocument;
  agreementSections: AgreementSection[];
}

export interface AgreementSection {
  title: string;
  body: string[];
}

export const EMPTY_PERSON: PersonInfo = {
  fullName: '',
  occupation: '',
  company: '',
  nationality: '',
  idNumber: '',
  phone: '',
  email: ''
};

export const DEFAULT_GRADE_FEES: Record<GradeLevel, GradeFeeSettings> = {
  'Pre-KG': { registrationFee: 1200, tuition: 18000, books: 900, uniform: 800, activities: 600, vat: 15 },
  KG1: { registrationFee: 1300, tuition: 19500, books: 1000, uniform: 850, activities: 650, vat: 15 },
  KG2: { registrationFee: 1400, tuition: 21000, books: 1100, uniform: 900, activities: 700, vat: 15 },
  'Grade 1': { registrationFee: 1500, tuition: 24000, books: 1400, uniform: 1000, activities: 800, vat: 15 },
  'Grade 2': { registrationFee: 1500, tuition: 25000, books: 1450, uniform: 1000, activities: 850, vat: 15 },
  'Grade 3': { registrationFee: 1500, tuition: 26000, books: 1500, uniform: 1050, activities: 900, vat: 15 },
  'Grade 4': { registrationFee: 1600, tuition: 27000, books: 1550, uniform: 1050, activities: 950, vat: 15 },
  'Grade 5': { registrationFee: 1600, tuition: 28000, books: 1600, uniform: 1100, activities: 1000, vat: 15 },
  'Grade 6': { registrationFee: 1700, tuition: 29500, books: 1650, uniform: 1100, activities: 1050, vat: 15 },
  'Grade 7': { registrationFee: 1700, tuition: 31000, books: 1750, uniform: 1150, activities: 1100, vat: 15 },
  'Grade 8': { registrationFee: 1800, tuition: 32500, books: 1800, uniform: 1150, activities: 1150, vat: 15 },
  'Grade 9': { registrationFee: 1800, tuition: 34000, books: 1900, uniform: 1200, activities: 1200, vat: 15 },
  'Grade 10': { registrationFee: 1900, tuition: 36000, books: 2100, uniform: 1250, activities: 1300, vat: 15 },
  'Grade 11': { registrationFee: 1900, tuition: 38000, books: 2200, uniform: 1250, activities: 1350, vat: 15 },
  'Grade 12': { registrationFee: 2000, tuition: 40000, books: 2300, uniform: 1300, activities: 1400, vat: 15 }
};

export const DEFAULT_TRANSPORTATION_AREAS: TransportationArea[] = [
  { id: 'al-nada', name: 'Al Nada', annualFee: 2500 },
  { id: 'al-rabwah', name: 'Al Rabwah', annualFee: 2200 },
  { id: 'al-yasmin', name: 'Al Yasmin', annualFee: 3000 }
];

export const DEFAULT_SETTINGS: SchoolSettings = {
  schoolName: 'Rawafed International School',
  schoolNameAr: 'مدارس روافد العالمية',
  logoDataUrl: '',
  address: 'Riyadh, Kingdom of Saudi Arabia',
  phone: '+966 11 000 0000',
  email: 'admissions@rawafed.school',
  academicYear: '',
  vat: 15,
  fees: {
    registrationFee: 1500,
    tuition: 28000,
    transportationFee: 4500,
    books: 1800,
    uniform: 1200,
    activities: 900
  },
  gradeFees: DEFAULT_GRADE_FEES,
  transportationAreas: DEFAULT_TRANSPORTATION_AREAS,
  paymentPlans: ['Full Payment', '50/50', 'Custom Installments'],
  agreementSections: [
    {
      title: 'School Rules',
      body: [
        'Students must respect school values, staff, classmates, property, safety procedures, and all campus instructions.',
        'The school may update operational rules when required for student safety, academic quality, or Ministry guidance.'
      ]
    },
    {
      title: 'Registration Conditions',
      body: [
        'Admission is conditional until all required documents are submitted, reviewed, and approved by the admission office.',
        'The school may request placement assessment, interview, previous records, medical clarifications, or additional documents before final acceptance.'
      ]
    },
    {
      title: 'Payment Schedule',
      body: [
        'Standard payment plan is 35% on registration, 35% before the second term, and 30% before the final term.',
        'Seat reservation, books, uniform, transportation, activity charges, and VAT are reflected in the final financial summary.'
      ]
    },
    {
      title: 'Withdrawal and Refund Policy',
      body: [
        'Withdrawal requests must be submitted in writing to the admission office and finance department.',
        'Refund eligibility depends on the official withdrawal date, used services, issued materials, and the approved school refund schedule.'
      ]
    },
    {
      title: 'Parent Responsibilities',
      body: [
        'Parents are responsible for accurate information, timely payments, attendance follow-up, emergency availability, and respectful communication with the school.',
        'Parents must notify the school immediately of changes to contact details, custody arrangements, medical status, or transportation requirements.'
      ]
    },
    {
      title: 'Student Responsibilities',
      body: [
        'Students must attend punctually, wear the approved uniform, complete assignments, follow classroom expectations, and maintain respectful conduct.',
        'Repeated violations may lead to intervention plans, parent meetings, suspension of services, or admission review.'
      ]
    },
    {
      title: 'Attendance Policy',
      body: [
        'Absences, lateness, and early dismissal must follow school procedures and may require approved documentation.',
        'The school monitors attendance and may escalate repeated absence according to internal and regulatory requirements.'
      ]
    },
    {
      title: 'Medical Authorization',
      body: [
        'Parents authorize the school to provide basic first aid and contact emergency services when required.',
        'Medication is administered only according to school health procedures and documented parent authorization.'
      ]
    },
    {
      title: 'Privacy and Acceptance Policy',
      body: [
        'Registration data is used for admission, academic, health, finance, and communication purposes in accordance with school privacy practices.',
        'Final acceptance remains subject to document verification, academic suitability, fee settlement, and administrative approval.'
      ]
    }
  ]
};

export function createEmptyRegistration(): AdmissionRegistration {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    registrationNumber: '',
    status: 'draft',
    priority: 'normal',
    createdAt: now,
    updatedAt: now,
    student: {
      englishName: '',
      arabicName: '',
      applyingGrade: '',
      nationality: '',
      identityType: 'NATIONAL_ID',
      religion: '',
      nationalId: '',
      passportNumber: '',
      dateOfBirth: '',
      gender: '',
      previousSchool: ''
    },
    father: { ...EMPTY_PERSON },
    mother: { ...EMPTY_PERSON },
    address: {
      country: 'Saudi Arabia',
      city: 'Riyadh',
      district: '',
      street: '',
      building: '',
      zipCode: '',
      mapLocation: ''
    },
    emergency: {
      contactName: '',
      relationship: '',
      phone: '',
      alternativePhone: ''
    },
    medical: {
      bloodType: '',
      allergies: '',
      medicalConditions: '',
      medication: '',
      primaryPhysician: '',
      hospital: '',
      doctorPhone: '',
      insuranceCompany: '',
      insuranceNumber: '',
      specialNotes: ''
    },
   financial: {
      registrationFee: 0,
      tuition: 0,
      books: 0,
      uniform: 0,
      activities: 0,
      transportationRequired: false,
      transportationArea: '',
      transportationFee: DEFAULT_SETTINGS.fees['transportationFee'],
      vat: DEFAULT_SETTINGS.vat,
      grandTotal: 0,
      paymentPlan: 'Full Payment',
      paymentStatus: 'Unpaid'
    },
    agreement: {
      scrolledToEnd: false,
      accepted: false,
      acceptedAt: ''
    },
    signatures: {
      parentSignature: '',
      studentSignature: '',
      signedDate: new Date().toISOString().slice(0, 10)
    },
    documents: [],
    contractPdf: undefined,
    registrationInfoPdf: undefined,
    notes: '',
    internalComments: '',
    tags: [],
    timeline: [
      {
        id: crypto.randomUUID(),
        date: now,
        title: 'Draft started',
        description: 'Parent registration draft was created on the iPad.'
      }
    ]
  };
}
