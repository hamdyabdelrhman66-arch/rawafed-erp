import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
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
import { PaymentsService } from '../../core/finance/payments.service';

@Component({
  selector: 'raw-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule, FileUploaderComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly snackBar = inject(MatSnackBar);
  readonly admission = inject(AdmissionService);
  private readonly payments = inject(PaymentsService);

  settings: SchoolSettings = structuredClone(this.storage.settings());
  readonly grades = [...GRADE_LEVELS];
  vatBasis: 'INVOICE_ACCRUAL' | 'CASH' = 'INVOICE_ACCRUAL';
  vatBasisReason = '';
  vatBasisConfirmed = false;
  vatWarning = '';
  vatSaving = false;
  readonly feeColumns = [
    { key: 'registrationFee', label: 'Registration Fee' },
    { key: 'tuition', label: 'Tuition' },
    { key: 'books', label: 'Books' },
    { key: 'uniform', label: 'Uniform' },
    { key: 'activities', label: 'Activities' },
    { key: 'vat', label: 'VAT %' }
  ] as const;

  async ngOnInit(): Promise<void> {
    try {
      const config = await this.payments.getVatConfiguration();
      this.vatBasis = config.basis;
      this.vatWarning = config.warningAr;
    } catch {
      this.vatWarning = 'تعذر تحميل إعداد أساس ضريبة القيمة المضافة.';
    }
  }

  async saveVatBasis(): Promise<void> {
    if (!this.vatBasisConfirmed || !this.vatBasisReason.trim()) {
      this.snackBar.open('يجب تأكيد الأساس وكتابة سبب التغيير.', 'إغلاق', { duration: 3500 });
      return;
    }
    this.vatSaving = true;
    try {
      const config = await this.payments.updateVatConfiguration({
        basis: this.vatBasis,
        confirmation: true,
        reason: this.vatBasisReason.trim(),
      });
      this.vatBasis = config.basis;
      this.vatBasisReason = '';
      this.vatBasisConfirmed = false;
      this.snackBar.open('تم حفظ إعداد أساس الضريبة.', 'إغلاق', { duration: 2500 });
    } catch (error: any) {
      this.snackBar.open(error?.message || 'تعذر حفظ إعداد أساس الضريبة.', 'إغلاق', { duration: 5000 });
    } finally {
      this.vatSaving = false;
    }
  }

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
