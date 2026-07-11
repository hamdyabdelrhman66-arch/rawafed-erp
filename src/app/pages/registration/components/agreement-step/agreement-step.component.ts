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
  selector: 'raw-agreement-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCheckboxModule],
  templateUrl: './agreement-step.component.html',
  styleUrls: ['./agreement-step.component.scss']})
export class AgreementStepComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input({ required: true }) sections: AgreementSectionView[] = [];
  @Input() scrolledToEnd = false;
  @Output() reachedEnd = new EventEmitter<void>();

  handleScroll(event: Event): void {
    const element = event.target as HTMLElement;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) {
      this.reachedEnd.emit();
    }
  }
}
