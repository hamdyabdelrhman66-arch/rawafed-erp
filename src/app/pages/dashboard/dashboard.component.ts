import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AdmissionRegistration } from '../../core/models/admission.models';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatChipsModule, MatDividerModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  query = '';
  statusFilter = '';
  readonly open = signal<AdmissionRegistration | null>(null);
  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    return this.storage.registrations().filter((item) => {
      const statusMatches = !this.statusFilter || item.status === this.statusFilter;
      const haystack = [
        item.registrationNumber,
        item.student.englishName,
        item.student.arabicName,
        item.student.applyingGrade,
        item.student.nationalId,
        item.student.passportNumber,
        item.father.fullName,
        item.father.phone,
        item.father.email,
        item.mother.fullName,
        item.mother.phone,
        item.mother.email
      ].join(' ').toLowerCase();
      return statusMatches && (!q || haystack.includes(q));
    });
  });
  readonly todayCount = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.storage.registrations().filter((item) => (item.submittedAt || item.createdAt).startsWith(today)).length;
  });

  constructor(public readonly storage: StorageService, public readonly admission: AdmissionService) {}

  count(status: AdmissionRegistration['status']): number {
    return this.storage.registrations().filter((item) => item.status === status).length;
  }

  duplicate(item: AdmissionRegistration): void {
    this.storage.saveDraft(this.admission.duplicate(item));
  }

  photo(item: AdmissionRegistration): string {
    return item.documents.find((doc) => doc.label === 'Student Photo')?.dataUrl || '';
  }

  initials(name: string): string {
    return (name || 'RS').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  missingDocs(item: AdmissionRegistration): string[] {
    const required = ['Student Photo', 'Passport', 'Iqama', 'Birth Certificate', 'Vaccination'];
    return required.filter((label) => !item.documents.some((doc) => doc.label === label));
  }
}
