import { Injectable } from '@angular/core';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { AdmissionLetterRequest, AdmissionRegistration, PersonInfo, UploadedDocument } from '../models/admission.models';
import { ContractService } from '../contract-engine/contract.service';
import { FinanceStorageService } from '../finance/finance-storage.service';
import { ApiService } from '../api/api.service';
import { StorageService } from './storage.service';

type PdfKind = 'contract' | 'registrationInfo';

interface StudentFileContext {
  pdf: jsPDF;
  background: string;
  registration: AdmissionRegistration;
  y: number;
}

interface BackendUpload {
  id: string;
  url: string;
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class AdmissionService {
  constructor(
    private readonly storage: StorageService,
    private readonly contract: ContractService,
    private readonly finance: FinanceStorageService,
    private readonly api: ApiService
  ) {}

  async submit(registration: AdmissionRegistration): Promise<AdmissionRegistration> {
    const registrationNumber = this.resolveRegistrationNumber(registration);
    const detailsUrl = `${location.origin}/admin?registration=${encodeURIComponent(registrationNumber)}`;
    const qrDataUrl = await QRCode.toDataURL(detailsUrl, { margin: 1, width: 220, color: { dark: '#0a57a4' } });
    const now = new Date().toISOString();
    const base: AdmissionRegistration = {
      ...registration,
      registrationNumber,
      status: 'pending',
      submittedAt: now,
      updatedAt: now,
      qrDataUrl,
      timeline: [
        ...registration.timeline,
        {
          id: crypto.randomUUID(),
          date: now,
          title: 'Submitted',
          description: `Application ${registrationNumber} submitted for admission review.`
        }
      ]
    };
    const submitted: AdmissionRegistration = {
      ...base,
      contractPdf: undefined,
      registrationInfoPdf: undefined
    };
    try {
      const saved = await this.api.post<AdmissionRegistration>('/registrations', submitted);
      this.storage.upsertRegistration(saved);
      this.storage.clearDraft();
      return saved;
    } catch {
      this.finance.ensureAccountFromRegistration(submitted);
      this.storage.upsertRegistration(submitted);
      this.storage.clearDraft();
      this.storage.notify(
        `New registration submitted: ${submitted.student.englishName || registrationNumber}`,
        ['Admissions', 'Registrar', 'Principal', 'Super Admin'],
        'registration',
        '/applications',
        `registration-approval:${submitted.id}`
      );
      this.storage.notify(
        `Finance account created for ${submitted.student.englishName || registrationNumber}. Expected total: ${submitted.financial.grandTotal.toLocaleString('en-US')} SAR`,
        ['Finance', 'Super Admin'],
        'finance',
        '/finance/patient-packages',
        `finance-account:${submitted.id}`
      );
      return submitted;
    }
  }

  duplicate(registration: AdmissionRegistration): AdmissionRegistration {
    const now = new Date().toISOString();
    const copy = structuredClone(registration);
    return {
      ...copy,
      id: crypto.randomUUID(),
      registrationNumber: '',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      submittedAt: undefined,
      qrDataUrl: undefined,
      contractPdf: undefined,
      registrationInfoPdf: undefined,
      timeline: [
        {
          id: crypto.randomUUID(),
          date: now,
          title: 'Duplicated',
          description: `Created from ${registration.registrationNumber}.`
        }
      ]
    };
  }

  setStatus(registration: AdmissionRegistration, status: AdmissionRegistration['status']): void {
    const now = new Date().toISOString();
    this.storage.upsertRegistration({
      ...registration,
      status,
      timeline: [
        ...registration.timeline,
        {
          id: crypto.randomUUID(),
          date: now,
          title: status[0].toUpperCase() + status.slice(1),
          description: `Admission status changed to ${status}.`
        }
      ]
    });
  }

  exportExcel(): void {
    const rows = this.storage.registrations().map((item) => ({
      'Registration Number': item.registrationNumber,
      Status: item.status,
      'Payment Status': item.financial.paymentStatus,
      'Registration Date': item.submittedAt || item.createdAt,
      Grade: item.student.applyingGrade,
      Student: item.student.englishName,
      'Student Arabic Name': item.student.arabicName,
      Nationality: item.student.nationality,
      'National ID': item.student.nationalId,
      Passport: item.student.passportNumber,
      Father: item.father.fullName,
      'Father Phone': item.father.phone,
      'Father Email': item.father.email,
      Mother: item.mother.fullName,
      'Mother Phone': item.mother.phone,
      'Mother Email': item.mother.email,
      City: item.address.city,
      District: item.address.district,
      'Emergency Contact': item.emergency.contactName,
      'Emergency Phone': item.emergency.phone,
      'Blood Type': item.medical.bloodType,
      Allergies: item.medical.allergies,
      'Registration Fee': item.financial.registrationFee,
      Tuition: item.financial.tuition,
      Books: item.financial.books,
      Uniform: item.financial.uniform,
      Activities: item.financial.activities,
      Transportation: item.financial.transportationRequired ? item.financial.transportationFee : 0,
      VAT: item.financial.vat,
      'Grand Total': item.financial.grandTotal,
      'Payment Plan': item.financial.paymentPlan,
      'Contract PDF': item.contractPdf?.fileName || '',
      'Registration Info PDF': item.registrationInfoPdf?.fileName || '',
      Documents: item.documents.map((doc) => doc.label).join(', '),
      Tags: item.tags.join(', ')
    }));
    const headers = Object.keys(rows[0] || { Empty: '' });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header as keyof typeof row])).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rawafed-registrations.xls';
    link.click();
    URL.revokeObjectURL(url);
  }

  downloadPdf(registration: AdmissionRegistration): void {
    this.downloadContractPdf(registration);
  }

  downloadContractPdf(registration: AdmissionRegistration): void {
    this.downloadRegistrationPdf(registration, 'contract');
  }

  downloadContractCalibrationPdf(): void {
    this.contract.generateContractCalibrationPdf();
  }

  downloadRegistrationInfoPdf(registration: AdmissionRegistration): void {
    this.downloadRegistrationPdf(registration, 'registrationInfo');
  }

  downloadSubmittedPdfs(registration: AdmissionRegistration): void {
    this.downloadRegistrationPdf(registration, 'contract').catch((error) => console.error('Contract PDF download failed', error));
    window.setTimeout(() => {
      this.downloadRegistrationPdf(registration, 'registrationInfo').catch((error) => console.error('Student file PDF download failed', error));
    }, 300);
  }

  previewAdmissionLetter(request: AdmissionLetterRequest): void {
    window.open(this.buildAdmissionLetterPdf(request).output('bloburl'), '_blank');
  }

  downloadAdmissionLetter(request: AdmissionLetterRequest): void {
    const safeName = (request.studentName || 'student').trim().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
    this.buildAdmissionLetterPdf(request).save(`admission-letter-${safeName || 'student'}.pdf`);
  }

  createAdmissionLetterEmailText(request: AdmissionLetterRequest): string {
    const settings = this.storage.settings();
    return [
      `To: ${request.recipientEmail || 'recipient@example.com'}`,
      `Subject: Admission Letter - ${request.studentName || 'Student'}`,
      '',
      `Dear ${request.recipientSchool || 'School Administration'},`,
      '',
      `Please find attached the admission letter for ${request.studentName || 'the student'} for ${request.grade || 'the selected grade'}.`,
      'Kindly prepare the student file transfer, attested documents, financial clearance, and Noor system transfer as requested in the letter.',
      request.notes ? `\nNotes: ${request.notes}` : '',
      '',
      'Regards,',
      settings.schoolName,
      settings.email
    ].filter(Boolean).join('\n');
  }

  async fileToDocument(file: File, label: string): Promise<UploadedDocument> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    let upload: BackendUpload | undefined;
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('label', label);
      upload = await this.api.postForm<BackendUpload>('/uploads', form);
    } catch {
      upload = undefined;
    }
    return {
      id: upload?.id || crypto.randomUUID(),
      label,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl,
      uploadUrl: upload?.url,
      backendId: upload?.id,
      verified: false,
      uploadedAt: new Date().toISOString()
    };
  }

  calculateGrandTotal(value: AdmissionRegistration['financial']): number {
    const transportation = value.transportationRequired ? value.transportationFee : 0;
    const subtotal = value.registrationFee + value.tuition + transportation + value.books + value.uniform + value.activities;
    const vatAmount = subtotal * (value.vat / 100);
    return subtotal + vatAmount;
  }

  private async downloadRegistrationPdf(registration: AdmissionRegistration, kind: PdfKind): Promise<void> {
    const document = kind === 'contract' ? registration.contractPdf : registration.registrationInfoPdf;
    if (document?.dataUrl) {
      this.triggerDownload(document.dataUrl, document.fileName);
      return;
    }
    const dataUrl = kind === 'contract' ? await this.contract.generateSignedContractPdf(registration) : await this.buildRegistrationInfoDataUrl(registration);
    this.triggerDownload(dataUrl, `${registration.registrationNumber || 'draft'}-${kind === 'contract' ? 'official-contract' : 'registration-information'}.pdf`);
  }

  private async buildRegistrationInfoDataUrl(registration: AdmissionRegistration): Promise<string> {
    const context: StudentFileContext = {
      pdf: new jsPDF({ unit: 'pt', format: 'a4' }),
      background: await this.fetchAssetDataUrl('templates/proposal-background.jpg', 'image/jpeg'),
      registration,
      y: 0
    };

    await this.addStudentFilePage(context, 'Registration Information / Student File');
    await this.studentFileSection(context, 'Student Information', [
      ['Registration Number', registration.registrationNumber || 'Draft'],
      ['English Name', registration.student.englishName],
      ['Arabic Name', registration.student.arabicName],
      ['Applying Grade', registration.student.applyingGrade],
      ['Nationality', registration.student.nationality],
      ['Religion', registration.student.religion],
      ['National ID / Iqama', registration.student.nationalId],
      ['Passport Number', registration.student.passportNumber],
      ['Date of Birth', registration.student.dateOfBirth],
      ['Gender', registration.student.gender],
      ['Previous School', registration.student.previousSchool]
    ]);
    await this.studentFileSection(context, 'Parents / Guardian Information', [
      ['Father', `${registration.father.fullName} | ${registration.father.idNumber} | ${registration.father.phone} | ${registration.father.email}`],
      ['Father Work', `${registration.father.occupation} | ${registration.father.company}`],
      ['Mother', `${registration.mother.fullName} | ${registration.mother.idNumber} | ${registration.mother.phone} | ${registration.mother.email}`],
      ['Mother Work', `${registration.mother.occupation} | ${registration.mother.company}`]
    ]);
    await this.studentFileSection(context, 'Address', [
      ['Country / City', `${registration.address.country}, ${registration.address.city}`],
      ['District / Street', `${registration.address.district}, ${registration.address.street}`],
      ['Building / ZIP', `${registration.address.building}, ${registration.address.zipCode}`],
      ['Map Location', registration.address.mapLocation]
    ]);
    await this.studentFileSection(context, 'Emergency Contact', [
      ['Contact', registration.emergency.contactName],
      ['Relationship', registration.emergency.relationship],
      ['Phone', registration.emergency.phone],
      ['Alternative Phone', registration.emergency.alternativePhone]
    ]);
    await this.studentFileSection(context, 'Medical Information', [
      ['Blood Type', registration.medical.bloodType],
      ['Allergies', registration.medical.allergies || 'None declared'],
      ['Medical Conditions', registration.medical.medicalConditions || 'None declared'],
      ['Medication', registration.medical.medication || 'None declared'],
      ['Physician / Hospital', `${registration.medical.primaryPhysician} | ${registration.medical.hospital}`],
      ['Doctor Phone', registration.medical.doctorPhone],
      ['Insurance', `${registration.medical.insuranceCompany} | ${registration.medical.insuranceNumber}`],
      ['Special Notes', registration.medical.specialNotes]
    ]);
    await this.studentFileSection(context, 'Documents', registration.documents.map((doc) => [doc.label, `${doc.fileName} | ${doc.verified ? 'Verified' : 'Needs review'}`]));
    await this.studentFileSection(context, 'Financial Summary', [
      ['Registration Fee', this.currency(registration.financial.registrationFee)],
      ['Tuition', this.currency(registration.financial.tuition)],
      ['Books', this.currency(registration.financial.books)],
      ['Uniform', this.currency(registration.financial.uniform)],
      ['Activities', this.currency(registration.financial.activities)],
      ['Transportation', registration.financial.transportationRequired ? `${registration.financial.transportationArea} | ${this.currency(registration.financial.transportationFee)}` : 'Not selected'],
      ['VAT', `${registration.financial.vat}%`],
      ['Payment Plan', registration.financial.paymentPlan],
      ['Payment Status', registration.financial.paymentStatus],
      ['Grand Total', this.currency(registration.financial.grandTotal)]
    ]);
    await this.studentFileSection(context, 'Agreement and Signature', [
      ['Agreement Status', registration.agreement.accepted ? 'Accepted' : 'Not accepted'],
      ['Agreement Date', registration.agreement.acceptedAt ? new Date(registration.agreement.acceptedAt).toLocaleString() : '-'],
      ['Submission Date', registration.submittedAt ? new Date(registration.submittedAt).toLocaleString() : '-']
    ]);
    await this.ensureStudentFileSpace(context, 112);
    await this.drawStudentFileText(context, 'Parent Signature', 58, context.y, 160, 16, 'left', 12, true, '#1d1c50');
    context.pdf.setDrawColor(210, 218, 232);
    context.pdf.roundedRect(58, context.y + 12, 224, 76, 4, 4);
    if (registration.signatures.parentSignature) context.pdf.addImage(registration.signatures.parentSignature, 'PNG', 74, context.y + 24, 170, 48);
    await this.drawStudentFileFooters(context);
    return context.pdf.output('datauristring');
  }

  private buildAdmissionLetterPdf(request: AdmissionLetterRequest): jsPDF {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const settings = this.storage.settings();
    pdf.setFillColor(29, 28, 80);
    pdf.triangle(0, 0, 595, 0, 565, 34, 'F');
    pdf.setFillColor(174, 45, 43);
    pdf.triangle(0, 0, 190, 0, 0, 24, 'F');
    pdf.setTextColor('#1d1c50');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text('RAWAFED', 297.5, 82, { align: 'center' });
    pdf.setFontSize(20);
    pdf.setTextColor('#aa2a2a');
    pdf.text('Admission Letter', 297.5, 140, { align: 'center' });
    pdf.setDrawColor(29, 28, 80);
    pdf.line(60, 152, 280, 152);
    pdf.line(315, 152, 535, 152);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(13);
    pdf.setTextColor('#111111');
    const lines = [
      `Dear ${request.recipientSchool || 'School Administration'},`,
      'We are pleased to write this letter to inform you that:',
      `Student Name: ${request.studentName || '......................................'}`,
      `Grade: ${request.grade || '..........'}`,
      `Has been accepted as a student at ${settings.schoolName}.`,
      'Therefore, we kindly request that you send the student complete file, including all attested documents, financial clearance, and Noor system transfer as soon as possible.',
      request.notes ? `Additional notes: ${request.notes}` : ''
    ].filter(Boolean);
    let y = 220;
    lines.forEach((line) => {
      const wrapped = pdf.splitTextToSize(line, 500);
      pdf.text(wrapped, 48, y);
      y += Math.max(22, wrapped.length * 17);
    });
    pdf.setFillColor(29, 28, 80);
    pdf.triangle(0, 842, 210, 842, 0, 826, 'F');
    pdf.setFillColor(174, 45, 43);
    pdf.triangle(395, 842, 595, 842, 595, 824, 'F');
    return pdf;
  }

  private async createStudentFileTextImage(value: string, width: number, height: number, align: CanvasTextAlign, fontSize?: number, color = '#111111', bold = false, multiline = false, lineGap = 3): Promise<string> {
    await document.fonts?.load(`${fontSize || 12}px Cairo`);
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) return 'data:image/png;base64,';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = `${bold ? 700 : 500} ${Math.max(8, fontSize || height * 0.72) * scale}px Cairo, Arial, Tahoma, sans-serif`;
    context.textAlign = align;
    context.textBaseline = 'middle';
    context.direction = this.hasArabic(value) ? 'rtl' : 'ltr';
    const textX = align === 'center' ? canvas.width / 2 : align === 'right' ? canvas.width - 3 * scale : 3 * scale;
    if (multiline) {
      const lines = this.wrapCanvasText(value, Math.max(20, Math.floor(width / Math.max(4.8, fontSize || 12))));
      const lineHeight = ((fontSize || 12) + lineGap) * scale;
      const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => context.fillText(line, textX, startY + index * lineHeight, canvas.width - 8 * scale));
    } else {
      context.fillText(value, textX, canvas.height / 2, canvas.width - 6 * scale);
    }
    return canvas.toDataURL('image/png');
  }

  private async fetchAssetBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async fetchAssetDataUrl(path: string, mimeType: string): Promise<string> {
    const bytes = await this.fetchAssetBytes(path);
    return this.bytesToDataUrl(bytes, mimeType);
  }

  private async addStudentFilePage(context: StudentFileContext, title: string): Promise<void> {
    const { pdf, background, registration } = context;
    pdf.addImage(background, 'JPEG', 0, 0, 595, 842);
    context.y = 148;
    await this.drawStudentFileText(context, title, 64, context.y, 467, 24, 'center', 18, true, '#1d1c50');
    context.y += 34;
    await this.drawStudentFileText(context, `Registration: ${registration.registrationNumber || 'Draft'}`, 64, context.y, 235, 15, 'left', 9, false, '#50566a');
    await this.drawStudentFileText(context, `Generated: ${new Date().toLocaleDateString()}`, 360, context.y, 170, 15, 'right', 9, false, '#50566a');
    context.y += 30;
  }

  private async studentFileSection(context: StudentFileContext, title: string, rows: [string, string][]): Promise<void> {
    const safeRows = rows.length ? rows : [['None', '-']];
    await this.ensureStudentFileSpace(context, 38 + safeRows.length * 23);
    const { pdf } = context;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(224, 226, 232);
    pdf.roundedRect(52, context.y - 14, 491, 26, 4, 4, 'FD');
    await this.drawStudentFileText(context, title, 64, context.y - 8, 455, 14, 'left', 11, true, '#a82f2e');
    context.y += 24;

    for (const [label, rawValue] of safeRows) {
      const value = String(rawValue || '-');
      const lines = this.wrapCanvasText(value, 78).slice(0, 3);
      await this.ensureStudentFileSpace(context, Math.max(22, lines.length * 14) + 6);
      pdf.setDrawColor(229, 231, 237);
      pdf.line(58, context.y + 7, 537, context.y + 7);
      await this.drawStudentFileText(context, `${label}:`, 64, context.y - 6, 130, 16, 'left', 9, true, '#1d1c50');
      for (let index = 0; index < lines.length; index += 1) {
        await this.drawStudentFileText(context, lines[index], 198, context.y - 6 + index * 13, 322, 16, this.hasArabic(lines[index]) ? 'right' : 'left', 9, false, '#222222');
      }
      context.y += Math.max(22, lines.length * 14);
    }
    context.y += 18;
  }

  private async ensureStudentFileSpace(context: StudentFileContext, needed: number): Promise<void> {
    if (context.y + needed <= 748) return;
    context.pdf.addPage();
    await this.addStudentFilePage(context, 'Registration Information / Student File');
  }

  private async drawStudentFileText(context: StudentFileContext, value: string, x: number, y: number, width: number, height: number, align: CanvasTextAlign, fontSize: number, bold = false, color = '#111111'): Promise<void> {
    const dataUrl = await this.createStudentFileTextImage(value || '-', width, height, align, fontSize, color, bold, false);
    context.pdf.addImage(dataUrl, 'PNG', x, y, width, height);
  }

  private async drawStudentFileFooters(context: StudentFileContext): Promise<void> {
    const pageCount = context.pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      context.pdf.setPage(page);
      await this.drawStudentFileText(context, `Rawafed International School | ${context.registration.registrationNumber || 'Draft'}`, 56, 792, 330, 14, 'left', 8, false, '#5d6375');
      await this.drawStudentFileText(context, `Page ${page} of ${pageCount}`, 445, 792, 95, 14, 'right', 8, false, '#5d6375');
    }
    context.pdf.setPage(pageCount);
  }

  private wrapCanvasText(value: string, maxChars: number): string[] {
    const text = String(value || '-').replace(/\s+/g, ' ').trim();
    if (text.length <= maxChars) return [text || '-'];
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : ['-'];
  }

  private async createPdfDocument(label: string, fileName: string, dataUrl: string): Promise<UploadedDocument> {
    const bytes = this.dataUrlToBytes(dataUrl);
    return {
      id: crypto.randomUUID(),
      label,
      fileName,
      mimeType: 'application/pdf',
      size: bytes.length,
      dataUrl,
      verified: true,
      uploadedAt: new Date().toISOString()
    };
  }

  private drawInfoHeader(pdf: jsPDF, registration: AdmissionRegistration, title: string): number {
    const settings = this.storage.settings();
    pdf.setFillColor(10, 87, 164);
    pdf.rect(0, 0, 595, 92, 'F');
    pdf.setTextColor('#ffffff');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(settings.schoolName, 40, 34);
    pdf.setFontSize(12);
    pdf.text(title, 40, 58);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Registration: ${registration.registrationNumber || 'Draft'}`, 390, 34);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 390, 52);
    return 122;
  }

  private infoSection(pdf: jsPDF, y: number, title: string, rows: [string, string][]): number {
    if (!rows.length) rows = [['None', '-']];
    y = this.ensureInfoSpace(pdf, y, 34 + rows.length * 22);
    pdf.setFillColor(238, 245, 255);
    pdf.roundedRect(40, y - 16, 515, 24, 6, 6, 'F');
    pdf.setTextColor('#0a57a4');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(title, 52, y);
    y += 24;
    rows.forEach(([label, value]) => {
      y = this.ensureInfoSpace(pdf, y, 24);
      pdf.setDrawColor(228, 234, 244);
      pdf.line(40, y + 8, 555, y + 8);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor('#172033');
      pdf.text(`${label}:`, 52, y);
      pdf.setFont('helvetica', 'normal');
      const lines = pdf.splitTextToSize(String(value || '-'), 350).slice(0, 2);
      pdf.text(lines, 190, y);
      y += Math.max(22, lines.length * 12);
    });
    return y + 18;
  }

  private ensureInfoSpace(pdf: jsPDF, y: number, needed: number, registration?: AdmissionRegistration): number {
    if (y + needed <= 760) return y;
    pdf.addPage();
    return this.drawInfoHeader(pdf, registration || ({ registrationNumber: '' } as AdmissionRegistration), 'Registration Information / Student File');
  }

  private drawInfoFooter(pdf: jsPDF, registration: AdmissionRegistration): void {
    const settings = this.storage.settings();
    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(220, 229, 242);
      pdf.line(40, 790, 555, 790);
      pdf.setFontSize(8);
      pdf.setTextColor('#697386');
      pdf.text(`${settings.schoolName} | Registration ${registration.registrationNumber || 'Draft'}`, 40, 808);
      pdf.text(`Page ${page} of ${pageCount}`, 505, 808);
    }
  }

  private primaryParent(registration: AdmissionRegistration): PersonInfo {
    return registration.father.fullName ? registration.father : registration.mother;
  }

  private triggerDownload(dataUrl: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
  }

  private dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  private hasArabic(value: string): boolean {
    return /[\u0600-\u06FF]/.test(value);
  }

  private generateRegistrationNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `RAW-${year}-`;
    const highest = this.storage.registrations()
      .map((item) => item.registrationNumber || '')
      .filter((value) => value.startsWith(prefix))
      .map((value) => Number(value.slice(prefix.length)))
      .filter((value) => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 124);

    return `${prefix}${String(highest + 1).padStart(6, '0')}`;
  }

  private resolveRegistrationNumber(registration: AdmissionRegistration): string {
    const requested = registration.registrationNumber?.trim();
    const numberBelongsToAnotherRegistration = requested
      ? this.storage.registrations().some((item) => item.registrationNumber === requested && item.id !== registration.id)
      : false;

    return requested && !numberBelongsToAnotherRegistration ? requested : this.generateRegistrationNumber();
  }

  private currency(value: number): string {
    return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
  }
}
