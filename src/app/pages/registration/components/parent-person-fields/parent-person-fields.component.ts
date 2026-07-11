import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'raw-parent-person-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './parent-person-fields.component.html',
  styleUrls: ['./parent-person-fields.component.scss']
})
export class ParentPersonFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
}
