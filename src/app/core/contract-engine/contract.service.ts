import { Injectable } from '@angular/core';
import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { AdmissionRegistration, PersonInfo } from '../models/admission.models';
import { StorageService } from '../services/storage.service';
import { CONTRACT_FIELDS, ContractFieldBox, ContractFieldName } from './contract-fields';
import { drawCalibrationField, drawImageField, drawTextField } from './contract-renderer';
import { arabicWeekday, bytesToDataUrl, formatFees, formatGregorianDate, parseContractDate, triggerDownload } from './contract-utils';

const CONTRACT_TEMPLATE_PATH = 'templates/official-contract-template.pdf';
const CAIRO_BOLD_FONT_PATH = 'fonts/Cairo-Bold.ttf';
const CAIRO_FONT_PATH = 'fonts/Cairo.ttf';

@Injectable({ providedIn: 'root' })
export class ContractService {
  constructor(private readonly storage: StorageService) {}

  async generateSignedContractPdf(registration: AdmissionRegistration): Promise<string> {
    const pdf = await this.loadOfficialContractPdf();
    const cairoBoldFont = await this.embedCairoBold(pdf);
    const pages = pdf.getPages();
    const renderedFields = new Set<ContractFieldName>();

    const textValues = this.contractTextValues(registration);
    for (const [fieldName, value] of Object.entries(textValues) as Array<[ContractFieldName, string]>) {
      this.assertFieldNotRendered(fieldName, renderedFields);
      const field = CONTRACT_FIELDS[fieldName];
      drawTextField(this.pageForField(pages, field), value, field, cairoBoldFont);
    }

    this.assertFieldNotRendered('parentSignaturePage5', renderedFields);
    await drawImageField(
      pdf,
      this.pageForField(pages, CONTRACT_FIELDS.parentSignaturePage5),
      registration.signatures.parentSignature,
      CONTRACT_FIELDS.parentSignaturePage5
    );

    this.flattenFormFields(pdf);
    return bytesToDataUrl(await pdf.save(), 'application/pdf');
  }

  async generateContractCalibrationPdf(): Promise<string> {
    const pdf = await this.loadOfficialContractPdf();
    const cairoBoldFont = await this.embedCairoBold(pdf);
    const pages = pdf.getPages();

    Object.entries(CONTRACT_FIELDS).forEach(([fieldName, field]) => {
      drawCalibrationField(this.pageForField(pages, field), fieldName, field, cairoBoldFont);
    });

    const dataUrl = bytesToDataUrl(await pdf.save(), 'application/pdf');
    triggerDownload(dataUrl, 'Contract-Calibration.pdf');
    return dataUrl;
  }

  private contractTextValues(registration: AdmissionRegistration): Record<Exclude<ContractFieldName, 'parentSignaturePage5'>, string> {
    const parent = this.primaryParent(registration);
    const signedDate = registration.signatures.signedDate || new Date().toISOString().slice(0, 10);
    const contractDate = parseContractDate(signedDate);
    const studentName = registration.student.arabicName || registration.student.englishName;

    return {
      contractDayName: arabicWeekday(contractDate),
      contractGregorianDate: formatGregorianDate(contractDate),
      parentNamePage1: parent.fullName,
      parentIdPage1: parent.idNumber,
      parentPhonePage1: parent.phone,
      parentEmailPage1: parent.email,
      studentNamePage1: studentName,
      studentGradePage1: registration.student.applyingGrade,
      totalFeesPage1: formatFees(registration.financial.grandTotal),
      parentNameDeclarationPage5: parent.fullName,
      studentNameDeclarationPage5: studentName,
      parentNameSignaturePage5: parent.fullName,
      parentRoleSignaturePage5: 'ولي أمر',
      signedDatePage5: formatGregorianDate(contractDate)
    };
  }

  private async loadOfficialContractPdf(): Promise<PDFDocument> {
    const uploadedContract = this.storage.settings().contractPdf?.dataUrl;
    const pdfBytes = uploadedContract ? this.dataUrlToBytes(uploadedContract) : await this.fetchAssetBytes(CONTRACT_TEMPLATE_PATH);
    const pdf = await PDFDocument.load(pdfBytes);
    pdf.registerFontkit(fontkit);
    return pdf;
  }

  private async embedCairoBold(pdf: PDFDocument): Promise<PDFFont> {
    const fontBytes = await this.fetchAssetBytes(CAIRO_BOLD_FONT_PATH).catch(() => this.fetchAssetBytes(CAIRO_FONT_PATH));
    return await pdf.embedFont(fontBytes, { subset: true });
  }

  private pageForField(pages: PDFPage[], field: ContractFieldBox): PDFPage {
    const page = pages[field.page - 1];
    if (!page) throw new Error(`Contract template does not include page ${field.page}`);
    return page;
  }

  private flattenFormFields(pdf: PDFDocument): void {
    const form = pdf.getForm();
    if (form.getFields().length) form.flatten();
  }

  private async fetchAssetBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private assertFieldNotRendered(fieldName: ContractFieldName, renderedFields: Set<ContractFieldName>): void {
    if (renderedFields.has(fieldName)) throw new Error(`Contract field rendered more than once: ${fieldName}`);
    renderedFields.add(fieldName);
  }

  private primaryParent(registration: AdmissionRegistration): PersonInfo {
    return registration.father.fullName ? registration.father : registration.mother;
  }
}
