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
  selector: 'raw-documents-step',
  standalone: true,
  imports: [CommonModule, MatIconModule, FileUploaderComponent],
  templateUrl: './documents-step.component.html',
  styleUrls: ['./documents-step.component.scss']})
export class DocumentsStepComponent {
  @Input({ required: true }) documentLabels: string[] = [];
  @Input({ required: true }) documents: UploadedDocument[] = [];
  @Input({ required: true }) missingDocuments: string[] = [];
  @Output() uploaded = new EventEmitter<UploadedDocument>();
  @Output() deleteDocument = new EventEmitter<string>();

  documentFor(label: string): UploadedDocument | undefined {
    return this.documents.find((item) => item.label === label);
  }
}
