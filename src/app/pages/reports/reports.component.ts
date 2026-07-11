import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdmissionService } from '../../core/services/admission.service';
import { GRADE_LEVELS } from '../../core/models/admission.models';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-reports',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent {
  readonly storage = inject(StorageService);
  readonly admission = inject(AdmissionService);
  readonly totalRevenue = computed(() => this.storage.registrations().reduce((sum, item) => sum + (item.financial.grandTotal || 0), 0));
  readonly gradeRows = computed(() =>
    GRADE_LEVELS.map((grade) => ({
      grade,
      count: this.storage.registrations().filter((item) => item.student.applyingGrade === grade).length
    })).filter((row) => row.count)
  );
}
