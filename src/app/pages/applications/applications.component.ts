import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdmissionService } from '../../core/services/admission.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-applications',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './applications.component.html',
  styleUrls: ['./applications.component.scss']
})
export class ApplicationsComponent {
  readonly storage = inject(StorageService);
  readonly admission = inject(AdmissionService);
  readonly applications = computed(() => this.storage.registrations().filter((item) => item.status !== 'approved'));
}
