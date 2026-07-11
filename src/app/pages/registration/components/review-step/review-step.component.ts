import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { UploadedDocument } from '../../../../core/models/admission.models';
import { FileUploaderComponent } from '../../../../shared/components/file-uploader/file-uploader.component';
import { SignaturePadComponent } from '../../../../shared/components/signature-pad/signature-pad.component';
import { SummaryCardComponent } from '../../../../shared/components/summary-card/summary-card.component';

type SummaryRows = [string, string][];
type AgreementSectionView = { title: string; body: string[] };

const MATERIAL_FORM_IMPORTS = [CommonModule, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule];
@Component({
  selector: 'raw-review-step',
  standalone: true,
  imports: [CommonModule, MatChipsModule, SummaryCardComponent],
  templateUrl: './review-step.component.html',
  styleUrls: ['./review-step.component.scss']})
export class ReviewStepComponent {
  @Input({ required: true }) student: SummaryRows = [];
  @Input({ required: true }) parents: SummaryRows = [];
  @Input({ required: true }) emergency: SummaryRows = [];
  @Input({ required: true }) medical: SummaryRows = [];
  @Input({ required: true }) financial: SummaryRows = [];
  @Input({ required: true }) documents: SummaryRows = [];
  @Input({ required: true }) missingDocuments: string[] = [];
  @Input() agreementAccepted = false;
  @Input() hasParentSignature = false;
  @Input() parentSignature = '';
}
