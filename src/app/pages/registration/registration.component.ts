import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AdmissionRegistration, GRADE_LEVELS, GradeLevel, PaymentPlan, UploadedDocument, createEmptyRegistration } from '../../core/models/admission.models';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';
import { duplicateValidator } from '../../core/validators/duplicate.validator';
import {
  AgreementStepComponent,
  DocumentsStepComponent,
  EmergencyStepComponent,
  FinancialStepComponent,
  MedicalStepComponent,
  ParentsStepComponent,
  ReviewStepComponent,
  SignatureStepComponent,
  StudentStepComponent
} from './components';

@Component({
  selector: 'raw-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatStepperModule,
    StudentStepComponent,
    ParentsStepComponent,
    EmergencyStepComponent,
    MedicalStepComponent,
    DocumentsStepComponent,
    FinancialStepComponent,
    AgreementStepComponent,
    SignatureStepComponent,
    ReviewStepComponent
  ],
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class RegistrationComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly storage = inject(StorageService);
  private readonly admission = inject(AdmissionService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  readonly activeStep = signal(0);
  readonly draft = signal<AdmissionRegistration>(createEmptyRegistration());
  readonly documents = signal<UploadedDocument[]>([]);
  readonly agreementScrolled = signal(false);
  readonly parentSignature = signal('');
  readonly studentSignature = signal('');
  readonly agreementSections = computed(() => this.storage.settings().agreementSections);
  readonly transportationAreas = computed(() => this.storage.settings().transportationAreas);
  readonly progress = computed(() => Math.round(((this.activeStep() + 1) / 9) * 100));
  readonly missingDocuments = computed(() => this.documentLabels.filter((label) => !this.documents().some((doc) => doc.label === label)));
  readonly documentsComplete = computed(() => this.missingDocuments().length === 0);
  readonly agreementAccepted = computed(() => Boolean(this.agreementGroup.controls['accepted']?.value));
  readonly hasParentSignature = computed(() => Boolean(this.parentSignature()));
  readonly isSubmitting = signal(false);
  readonly submittedRegistration = signal<AdmissionRegistration | null>(null);
  readonly submitError = signal('');

  readonly grades = [...GRADE_LEVELS];
  readonly bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  readonly firstStepDocs = ['Student Photo', 'Birth Certificate', 'Passport', 'Iqama', 'Vaccination Record'];
  readonly documentLabels = ['Student Photo', 'Passport', 'Iqama', 'Birth Certificate', 'Vaccination Record', 'School Report', 'Transfer Certificate', 'Family Card', 'Any Other Files'];
  readonly paymentPlans: PaymentPlan[] = ['Full Payment', '50/50'];
  readonly feeFields = [
    { key: 'registrationFee', label: 'Registration Fee' },
    { key: 'tuition', label: 'Tuition' },
    { key: 'transportation', label: 'Transportation' },
    { key: 'books', label: 'Books' },
    { key: 'uniform', label: 'Uniform' },
    { key: 'activities', label: 'Activities' }
  ];

  readonly form = this.fb.group({
    student: this.fb.group({
      englishName: ['', Validators.required],
      arabicName: ['', Validators.required],
      applyingGrade: ['', Validators.required],
      nationality: ['', Validators.required],
      religion: [''],
      nationalId: ['', [Validators.required, duplicateValidator(this.storage, 'nationalId', () => this.draft().id)]],
      passportNumber: ['', duplicateValidator(this.storage, 'passportNumber', () => this.draft().id)],
      dateOfBirth: ['', Validators.required],
      gender: ['', Validators.required],
      previousSchool: ['']
    }),
    parents: this.fb.group({
      father: this.personGroup(),
      mother: this.personGroup(),
      address: this.fb.group({
        country: ['Saudi Arabia'],
        city: ['Riyadh'],
        district: [''],
        street: [''],
        building: [''],
        zipCode: [''],
        mapLocation: ['']
      })
    }),
    emergency: this.fb.group({
      contactName: ['', Validators.required],
      relationship: ['', Validators.required],
      phone: ['', Validators.required],
      alternativePhone: ['']
    }),
    medical: this.fb.group({
      bloodType: [''],
      allergies: [''],
      medicalConditions: [''],
      medication: [''],
      primaryPhysician: [''],
      hospital: [''],
      doctorPhone: [''],
      insuranceCompany: [''],
      insuranceNumber: [''],
      specialNotes: ['']
    }),
    documents: this.fb.group({
      acknowledged: [true]
    }),
    financial: this.fb.group({
      registrationFee: [0],
      tuition: [0],
      books: [0],
      uniform: [0],
      activities: [0],
      transportationRequired: [false],
      transportationArea: [''],
      transportationFee: [0],
      vat: [this.storage.settings().vat],
      paymentPlan: ['Full Payment'],
      grandTotal: [0],
      paymentStatus: ['Unpaid']
    }),
    agreement: this.fb.group({
      accepted: [false, Validators.requiredTrue],
      acceptedAt: [''],
      scrolledToEnd: [false]
    }),
    signature: this.fb.group({
      parentSignature: ['', Validators.required],
      studentSignature: [''],
      signedDate: [new Date().toISOString().slice(0, 10), Validators.required]
    }),
    review: this.fb.group({
      confirmed: [true]
    })
  });

  get studentGroup(): FormGroup { return this.form.controls.student; }
  get parentsGroup(): FormGroup { return this.form.controls.parents; }
  get emergencyGroup(): FormGroup { return this.form.controls.emergency; }
  get medicalGroup(): FormGroup { return this.form.controls.medical; }
  get documentsGroup(): FormGroup { return this.form.controls.documents; }
  get financialGroup(): FormGroup { return this.form.controls.financial; }
  get agreementGroup(): FormGroup { return this.form.controls.agreement; }
  get signatureGroup(): FormGroup { return this.form.controls.signature; }
  get reviewGroup(): FormGroup { return this.form.controls.review; }

  ngOnInit(): void {
    const recovered = this.storage.getDraft();
    const current = recovered || createEmptyRegistration();
    this.draft.set(current);
    this.documents.set(current.documents || []);
    this.agreementScrolled.set(current.agreement.scrolledToEnd);
    this.parentSignature.set(current.signatures.parentSignature);
    this.studentSignature.set(current.signatures.studentSignature);
    this.form.patchValue(this.registrationToFormValue(current));
    this.applyGradeFees(this.studentGroup.controls['applyingGrade'].value);
    this.applyTransportationSelection(Boolean(this.financialGroup.controls['transportationRequired'].value), this.financialGroup.controls['transportationArea'].value);
    this.recalculate();
    this.studentGroup.controls['applyingGrade'].valueChanges.pipe(takeUntil(this.destroy$)).subscribe((grade) => {
      this.applyGradeFees(grade);
      this.recalculate();
      this.storage.saveDraft(this.composeRegistration());
    });
    this.financialGroup.controls['transportationRequired'].valueChanges.pipe(takeUntil(this.destroy$)).subscribe((required) => {
      this.applyTransportationSelection(Boolean(required), this.financialGroup.controls['transportationArea'].value);
      this.recalculate();
      this.storage.saveDraft(this.composeRegistration());
    });
    this.financialGroup.controls['transportationArea'].valueChanges.pipe(takeUntil(this.destroy$)).subscribe((area) => {
      this.applyTransportationSelection(Boolean(this.financialGroup.controls['transportationRequired'].value), area);
      this.recalculate();
      this.storage.saveDraft(this.composeRegistration());
    });
    this.form.valueChanges.pipe(debounceTime(650), takeUntil(this.destroy$)).subscribe(() => {
      this.recalculate();
      this.syncSignatureSignals();
      this.storage.saveDraft(this.composeRegistration());
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  personGroup(): FormGroup {
    return this.fb.group({
      fullName: ['', Validators.required],
      occupation: [''],
      company: [''],
      nationality: [''],
      idNumber: [''],
      phone: ['', [Validators.required, duplicateValidator(this.storage, 'phone', () => this.draft().id)]],
      email: ['', [Validators.required, Validators.email, duplicateValidator(this.storage, 'email', () => this.draft().id)]]
    });
  }

  goNext(stepper: MatStepper, group: FormGroup, requireSignature = false): void {
    this.recalculate();
    group.markAllAsTouched();
    
    if (requireSignature && !this.parentSignature()) {
      this.snackBar.open('Parent signature is required before review.', 'OK', { duration: 2600 });
      this.scrollToFirstInvalid();
      return;
      
    }
    
    if (group.invalid) {
      this.snackBar.open('Please complete the highlighted fields before continuing.', 'OK', { duration: 2600 });
      this.scrollToFirstInvalid();
      return;
    }
    this.saveDraft(false);
    stepper.next();
  }

  upsertDocument(document: UploadedDocument): void {
    this.documents.set([document, ...this.documents().filter((item) => item.label !== document.label)]);
    this.saveDraft(false);
  }

  removeDocument(label: string): void {
    this.documents.set(this.documents().filter((item) => item.label !== label));
    this.saveDraft(false);
  }

  markAgreementScrolled(): void {
    this.agreementScrolled.set(true);
    this.agreementGroup.patchValue({ scrolledToEnd: true });
    this.saveDraft(false);
  }

  setSignature(field: 'parentSignature' | 'studentSignature', value: string): void {
    if (field === 'parentSignature') this.parentSignature.set(value);
    if (field === 'studentSignature') this.studentSignature.set(value);
    this.signatureGroup.patchValue({ [field]: value });
    this.saveDraft(false);
  }

  saveDraft(showMessage = true): void {
    this.storage.saveDraft(this.composeRegistration());
    if (showMessage) this.snackBar.open('Draft saved on this iPad.', 'OK', { duration: 1800 });
  }

  async submit(): Promise<void> {
    if (this.isSubmitting() || this.submittedRegistration()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid || !this.parentSignature()) {
      this.snackBar.open('Please complete required fields, agreement, and parent signature.', 'OK', { duration: 3000 });
      this.scrollToFirstInvalid();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');

    try {
      const submitted = await this.admission.submit(this.composeRegistration());
      this.submittedRegistration.set(submitted);
      this.draft.set(submitted);
      this.admission.downloadSubmittedPdfs(submitted);
      this.snackBar.open(`Registration submitted successfully: ${submitted.registrationNumber}`, 'OK', { duration: 5000 });
    } catch (error) {
      console.error('Registration submit failed', error);
      this.submitError.set('Registration was not submitted. Please try again.');
      this.snackBar.open('Registration was not submitted. Please try again.', 'OK', { duration: 5000 });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  goToApplications(): void {
    const submitted = this.submittedRegistration();
    void this.router.navigate(['/applications'], {
      queryParams: submitted?.registrationNumber ? { registration: submitted.registrationNumber } : undefined
    });
  }

  print(): void {
    window.print();
  }

  downloadDraftPdf(): void {
    this.admission.downloadContractPdf(this.composeRegistration());
  }

  downloadDraftRegistrationInfoPdf(): void {
    this.admission.downloadRegistrationInfoPdf(this.composeRegistration());
  }

  studentSummary(): [string, string][] {
    const item = this.composeRegistration().student;
    return [['Name', item.englishName], ['Arabic Name', item.arabicName], ['Grade', item.applyingGrade], ['ID / Iqama', item.nationalId], ['Passport', item.passportNumber]];
  }

  parentsSummary(): [string, string][] {
    const item = this.composeRegistration();
    return [['Father', item.father.fullName], ['Father Phone', item.father.phone], ['Mother', item.mother.fullName], ['Mother Phone', item.mother.phone], ['Address', `${item.address.city}, ${item.address.district}`]];
  }

  emergencySummary(): [string, string][] {
    const item = this.composeRegistration().emergency;
    return [['Contact', item.contactName], ['Relationship', item.relationship], ['Phone', item.phone], ['Alternative', item.alternativePhone]];
  }

  medicalSummary(): [string, string][] {
    const item = this.composeRegistration().medical;
    return [['Blood Type', item.bloodType], ['Allergies', item.allergies], ['Conditions', item.medicalConditions], ['Insurance', item.insuranceCompany]];
  }

  financialSummary(): [string, string][] {
    const item = this.composeRegistration().financial;
    return [
      ['Grand Total', `${(item.grandTotal ?? 0).toLocaleString()} SAR`],
      ['Payment Plan', item.paymentPlan],
      ['VAT', `${item.vat}%`],
      ['Transportation', item.transportationRequired ? `${item.transportationFee.toLocaleString()} SAR` : 'Not Selected'],
      ['Payment Status', item.paymentStatus ?? 'Unpaid']
    ];
  }

  documentsSummary(): [string, string][] {
    return this.documents().map((item) => [item.label, `${item.fileName} (${item.verified ? 'Verified' : 'Needs review'})`]);
  }

  private registrationToFormValue(registration: AdmissionRegistration): object {
    return {
      student: registration.student,
      parents: {
        father: registration.father,
        mother: registration.mother,
        address: registration.address
      },
      emergency: registration.emergency,
      medical: registration.medical,
      financial: registration.financial,
      agreement: registration.agreement,
      signature: registration.signatures
    };
  }

  private recalculate(): void {
    const financial = this.financialGroup.getRawValue() as AdmissionRegistration['financial'];
    const grandTotal = this.admission.calculateGrandTotal(financial);
    this.financialGroup.controls['grandTotal'].setValue(grandTotal, { emitEvent: false });
  }

  private applyGradeFees(grade: string | null | undefined): void {
    const fees = this.isGradeLevel(grade) ? this.storage.settings().gradeFees[grade] : undefined;
    this.financialGroup.patchValue(
      {
        registrationFee: fees?.registrationFee ?? 0,
        tuition: fees?.tuition ?? 0,
        books: fees?.books ?? 0,
        uniform: fees?.uniform ?? 0,
        activities: fees?.activities ?? 0,
        vat: fees?.vat ?? this.storage.settings().vat
      },
      { emitEvent: false }
    );
  }

  private applyTransportationSelection(required: boolean, areaName: string | null | undefined): void {
    const area = required ? this.storage.settings().transportationAreas.find((item) => item.name === areaName) : undefined;
    this.financialGroup.patchValue(
      {
        transportationArea: required ? areaName || '' : '',
        transportationFee: area?.annualFee ?? 0
      },
      { emitEvent: false }
    );
  }

  private isGradeLevel(value: string | null | undefined): value is GradeLevel {
    return GRADE_LEVELS.includes(value as GradeLevel);
  }

  private syncSignatureSignals(): void {
    const signature = this.signatureGroup.getRawValue() as AdmissionRegistration['signatures'];
    this.parentSignature.set(signature.parentSignature || '');
    this.studentSignature.set(signature.studentSignature || '');
  }

  private composeRegistration(): AdmissionRegistration {
    const value = this.form.getRawValue();
    const now = new Date().toISOString();
    const parents = value.parents as { father: AdmissionRegistration['father']; mother: AdmissionRegistration['mother']; address: AdmissionRegistration['address'] };
    const agreement = value.agreement as AdmissionRegistration['agreement'];
    const signature = value.signature as AdmissionRegistration['signatures'];
    return {
      ...this.draft(),
      student: value.student as AdmissionRegistration['student'],
      father: parents.father,
      mother: parents.mother,
      address: parents.address,
      emergency: value.emergency as AdmissionRegistration['emergency'],
      medical: value.medical as AdmissionRegistration['medical'],
      financial: value.financial as AdmissionRegistration['financial'],
      documents: this.documents(),
      updatedAt: now,
      agreement: {
        scrolledToEnd: this.agreementScrolled(),
        accepted: Boolean(agreement.accepted),
        acceptedAt: agreement.accepted ? agreement.acceptedAt || now : ''
      },
      signatures: {
        parentSignature: signature.parentSignature || this.parentSignature(),
        studentSignature: signature.studentSignature || this.studentSignature(),
        signedDate: signature.signedDate
      }
    };
  }

  private scrollToFirstInvalid(): void {
    window.setTimeout(() => {
      const invalid = document.querySelector('.ng-invalid:not(form), .mat-mdc-form-field-invalid, raw-signature-pad');
      invalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}
