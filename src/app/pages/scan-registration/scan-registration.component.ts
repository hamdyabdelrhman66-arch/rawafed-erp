import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { createWorker } from 'tesseract.js';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdmissionRegistration, GRADE_LEVELS, GradeLevel, UploadedDocument, createEmptyRegistration } from '../../core/models/admission.models';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';

interface ScanFields {
  englishName: string;
  arabicName: string;
  applyingGrade: string;
  nationality: string;
  nationalId: string;
  passportNumber: string;
  dateOfBirth: string;
  previousSchool: string;
  fatherName: string;
  fatherId: string;
  fatherPhone: string;
  fatherEmail: string;
  motherName: string;
  motherPhone: string;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
}

@Component({
  selector: 'raw-scan-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSnackBarModule],
  templateUrl: './scan-registration.component.html',
  styleUrls: ['./scan-registration.component.scss']
})
export class ScanRegistrationComponent {
  private readonly admission = inject(AdmissionService);
  private readonly storage = inject(StorageService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  readonly grades = GRADE_LEVELS;
  readonly fileName = signal('');
  readonly fileType = signal('');
  readonly previewUrl = signal('');
  readonly safePreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly uploadedDocument = signal<UploadedDocument | null>(null);
  readonly isSubmitting = signal(false);
  readonly isReading = signal(false);
  readonly ocrProgress = signal('');
  readonly scannedText = signal('');
  readonly lastCreated = signal<AdmissionRegistration | null>(null);

  readonly canPreviewImage = computed(() => this.fileType().startsWith('image/'));
  readonly canPreviewPdf = computed(() => this.fileType() === 'application/pdf');

  fields: ScanFields = this.emptyFields();

  async selectScan(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileName.set(file.name);
    this.fileType.set(file.type || '');
    const previewUrl = URL.createObjectURL(file);
    this.previewUrl.set(previewUrl);
    this.safePreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl));
    this.uploadedDocument.set(await this.admission.fileToDocument(file, 'Manual Registration Scan'));
    this.applyFilenameHints(file.name);
    this.snackBar.open('Scan uploaded. Review the extracted fields before creating the application.', 'OK', { duration: 2600 });
    input.value = '';
  }

  async readScan(): Promise<void> {
    if (!this.previewUrl() || !this.canPreviewImage()) {
      this.snackBar.open('OCR is available for image scans. For PDF scans, review the preview and enter the fields.', 'OK', { duration: 3600 });
      return;
    }

    this.isReading.set(true);
    this.ocrProgress.set('Starting OCR...');
    try {
      const worker = await createWorker('eng+ara', 1, {
        logger: (message) => {
          if (message.status) {
            const progress = message.progress ? ` ${Math.round(message.progress * 100)}%` : '';
            this.ocrProgress.set(`${message.status}${progress}`);
          }
        }
      });
      const result = await worker.recognize(this.previewUrl());
      await worker.terminate();
      const text = result.data.text || '';
      this.scannedText.set(text);
      this.applyOcrHints(text);
      this.snackBar.open('OCR finished. Please review every field before creating the application.', 'OK', { duration: 3600 });
    } catch (error) {
      console.error('OCR failed', error);
      this.snackBar.open('OCR could not read this scan. Please fill the fields manually from the preview.', 'OK', { duration: 4200 });
    } finally {
      this.isReading.set(false);
      this.ocrProgress.set('');
    }
  }

  async createRegistration(): Promise<void> {
    if (!this.uploadedDocument()) {
      this.snackBar.open('Upload the scanned registration form first.', 'OK', { duration: 2600 });
      return;
    }

    if (!this.fields.englishName.trim() || !this.fields.applyingGrade || !this.fields.nationalId.trim() || !this.fields.fatherPhone.trim()) {
      this.snackBar.open('Complete student name, grade, ID/Iqama, and parent phone before creating the application.', 'OK', { duration: 3200 });
      return;
    }

    this.isSubmitting.set(true);
    try {
      const registration = this.composeRegistration();
      const submitted = await this.admission.submit(registration);
      this.lastCreated.set(submitted);
      this.resetFormKeepConfirmation();
      this.snackBar.open(`Application created successfully: ${submitted.registrationNumber}`, 'OK', { duration: 5000 });
    } catch (error) {
      console.error('Scanned registration import failed', error);
      this.snackBar.open('Could not create the application. Please review the fields and try again.', 'OK', { duration: 4000 });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  viewApplications(): void {
    const registration = this.lastCreated();
    void this.router.navigate(['/applications'], {
      queryParams: registration?.registrationNumber ? { registration: registration.registrationNumber } : undefined
    });
  }

  clear(): void {
    this.fields = this.emptyFields();
    this.fileName.set('');
    this.fileType.set('');
    this.previewUrl.set('');
    this.safePreviewUrl.set(null);
    this.uploadedDocument.set(null);
    this.lastCreated.set(null);
    this.scannedText.set('');
    this.ocrProgress.set('');
  }

  private composeRegistration(): AdmissionRegistration {
    const registration = createEmptyRegistration();
    const settings = this.storage.settings();
    const grade = this.fields.applyingGrade as GradeLevel;
    const fees = GRADE_LEVELS.includes(grade) ? settings.gradeFees[grade] : undefined;
    const financial = {
      ...registration.financial,
      registrationFee: fees?.registrationFee ?? 0,
      tuition: fees?.tuition ?? 0,
      books: fees?.books ?? 0,
      uniform: fees?.uniform ?? 0,
      activities: fees?.activities ?? 0,
      vat: this.admission.isSaudiNationalId(this.fields.nationalId) ? 0 : fees?.vat ?? settings.vat
    };

    return {
      ...registration,
      student: {
        ...registration.student,
        englishName: this.fields.englishName.trim(),
        arabicName: this.fields.arabicName.trim(),
        applyingGrade: this.fields.applyingGrade,
        nationality: this.fields.nationality.trim(),
        nationalId: this.fields.nationalId.trim(),
        passportNumber: this.fields.passportNumber.trim(),
        dateOfBirth: this.fields.dateOfBirth,
        previousSchool: this.fields.previousSchool.trim()
      },
      father: {
        ...registration.father,
        fullName: this.fields.fatherName.trim(),
        idNumber: this.fields.fatherId.trim(),
        phone: this.fields.fatherPhone.trim(),
        email: this.fields.fatherEmail.trim()
      },
      mother: {
        ...registration.mother,
        fullName: this.fields.motherName.trim(),
        phone: this.fields.motherPhone.trim()
      },
      emergency: {
        ...registration.emergency,
        contactName: this.fields.emergencyName.trim() || this.fields.fatherName.trim(),
        phone: this.fields.emergencyPhone.trim() || this.fields.fatherPhone.trim(),
        relationship: this.fields.emergencyName.trim() ? 'Relative' : 'Father'
      },
      medical: {
        ...registration.medical,
        specialNotes: this.fields.medicalNotes.trim()
      },
      financial: {
        ...financial,
        grandTotal: this.admission.calculateGrandTotal(financial, this.fields.nationalId)
      },
      agreement: {
        scrolledToEnd: true,
        accepted: true,
        acceptedAt: new Date().toISOString()
      },
      documents: [this.uploadedDocument() as UploadedDocument],
      notes: 'Created from scanned manual registration form.'
    };
  }

  private resetFormKeepConfirmation(): void {
    this.fields = this.emptyFields();
    this.fileName.set('');
    this.fileType.set('');
    this.previewUrl.set('');
    this.safePreviewUrl.set(null);
    this.uploadedDocument.set(null);
    this.scannedText.set('');
    this.ocrProgress.set('');
  }

  private applyFilenameHints(fileName: string): void {
    const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (!this.fields.englishName && name && !/registration|scan|form/i.test(name)) {
      this.fields.englishName = name;
    }
  }

  private applyOcrHints(text: string): void {
    const compactText = text.replace(/\s+/g, ' ').trim();
    const email = compactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const numbers = Array.from(compactText.matchAll(/\b\d{7,15}\b/g)).map((match) => match[0]);
    const mobile = numbers.find((value) => /^05\d{8}$/.test(value)) || numbers.find((value) => value.length >= 9 && value.length <= 12) || '';
    const nationalId = numbers.find((value) => value.length === 10) || '';
    const grade = this.grades.find((item) => compactText.toLowerCase().includes(item.toLowerCase()));

    if (!this.fields.fatherEmail && email) this.fields.fatherEmail = email;
    if (!this.fields.fatherPhone && mobile) this.fields.fatherPhone = mobile;
    if (!this.fields.nationalId && nationalId) this.fields.nationalId = nationalId;
    if (!this.fields.applyingGrade && grade) this.fields.applyingGrade = grade;

    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const likelyName = lines.find((line) =>
      /^[A-Za-z][A-Za-z\s'-]{5,}$/.test(line) &&
      !/registration|form|school|passport|nationality|parent|student/i.test(line)
    );
    if (!this.fields.englishName && likelyName) this.fields.englishName = likelyName;
  }

  private emptyFields(): ScanFields {
    return {
      englishName: '',
      arabicName: '',
      applyingGrade: '',
      nationality: '',
      nationalId: '',
      passportNumber: '',
      dateOfBirth: '',
      previousSchool: '',
      fatherName: '',
      fatherId: '',
      fatherPhone: '',
      fatherEmail: '',
      motherName: '',
      motherPhone: '',
      emergencyName: '',
      emergencyPhone: '',
      medicalNotes: ''
    };
  }
}
