import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';
import { GRADE_LEVELS, SchoolSettings } from '../../core/models/admission.models';
import { FileUploaderComponent } from '../../shared/components/file-uploader/file-uploader.component';

@Component({
  selector: 'raw-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule, FileUploaderComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  private readonly storage = inject(StorageService);
  private readonly snackBar = inject(MatSnackBar);
  readonly admission = inject(AdmissionService);

  settings: SchoolSettings = structuredClone(this.storage.settings());
  readonly grades = [...GRADE_LEVELS];
  readonly feeColumns = [
    { key: 'registrationFee', label: 'Registration Fee' },
    { key: 'tuition', label: 'Tuition' },
    { key: 'books', label: 'Books' },
    { key: 'uniform', label: 'Uniform' },
    { key: 'activities', label: 'Activities' },
    { key: 'vat', label: 'VAT %' }
  ] as const;

  splitLines(value: string): string[] {
    return value.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  addTransportationArea(): void {
    this.settings.transportationAreas = [
      ...this.settings.transportationAreas,
      {
        id: crypto.randomUUID(),
        name: '',
        annualFee: 0
      }
    ];
  }

  removeTransportationArea(id: string): void {
    this.settings.transportationAreas = this.settings.transportationAreas.filter((area) => area.id !== id);
  }

  async save(): Promise<void> {
    await this.storage.saveSettings(this.settings);
    this.settings = structuredClone(this.storage.settings());
    this.snackBar.open('Settings saved.', 'OK', { duration: 2000 });
  }
}
