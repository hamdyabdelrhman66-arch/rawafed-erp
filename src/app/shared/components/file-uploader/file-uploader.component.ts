import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { AdmissionService } from '../../../core/services/admission.service';
import { UploadedDocument } from '../../../core/models/admission.models';

@Component({
  selector: 'raw-file-uploader',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './file-uploader.component.html',
  styleUrls: ['./file-uploader.component.scss']})
export class FileUploaderComponent {
  @Input({ required: true }) label = '';
  @Input() hint = 'PDF, image, or document';
  @Input() accept = 'image/*,.pdf';
  @Input() document?: UploadedDocument;
  @Output() uploaded = new EventEmitter<UploadedDocument>();
  @Output() delete = new EventEmitter<void>();

  constructor(private readonly admission: AdmissionService) {}

  async selectFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploaded.emit(await this.admission.fileToDocument(file, this.label));
    input.value = '';
  }
}
