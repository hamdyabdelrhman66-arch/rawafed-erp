import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdmissionLetterRequest, GRADE_LEVELS } from '../../core/models/admission.models';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-admission-letter',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSnackBarModule],
  templateUrl: './admission-letter.component.html',
  styleUrls: ['./admission-letter.component.scss']
})
export class AdmissionLetterComponent {
  private readonly admission = inject(AdmissionService);
  private readonly snackBar = inject(MatSnackBar);
  readonly storage = inject(StorageService);
  readonly grades = [...GRADE_LEVELS];
  readonly letter: AdmissionLetterRequest = {
    recipientSchool: '',
    studentName: '',
    grade: '',
    notes: '',
    recipientEmail: ''
  };
  emailDraft = '';

  preview(): void {
    this.admission.previewAdmissionLetter(this.letter);
  }

  download(): void {
    this.admission.downloadAdmissionLetter(this.letter);
  }

  async prepareEmail(): Promise<void> {
    this.emailDraft = this.admission.createAdmissionLetterEmailText(this.letter);
    try {
      await navigator.clipboard.writeText(this.emailDraft);
      this.snackBar.open('Email draft copied.', 'OK', { duration: 1800 });
    } catch {
      this.snackBar.open('Email draft prepared below.', 'OK', { duration: 1800 });
    }
  }
}
