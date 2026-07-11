import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ParentPersonFieldsComponent } from '../parent-person-fields/parent-person-fields.component';

@Component({
  selector: 'raw-parents-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, ParentPersonFieldsComponent],
  templateUrl: './parents-step.component.html',
  styleUrls: ['./parents-step.component.scss']
})
export class ParentsStepComponent {
  @Input({ required: true }) group!: FormGroup;

  parentGroup(name: 'father' | 'mother'): FormGroup {
    return this.group.get(name) as FormGroup;
  }
}
