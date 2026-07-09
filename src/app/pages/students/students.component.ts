import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AdmissionRegistration } from '../../core/models/admission.models';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-students',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './students.component.html',
  styleUrls: ['./students.component.scss']
})
export class StudentsComponent {
  private readonly storage = inject(StorageService);
  readonly students = computed(() => this.storage.registrations().filter((item) => item.status === 'approved'));

  initials(item: AdmissionRegistration): string {
    return (item.student.englishName || 'RS').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }
}
