import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { PaymentPlan, TransportationArea } from '../../../../core/models/admission.models';

const MATERIAL_IMPORTS = [
  CommonModule,
  ReactiveFormsModule,
  MatButtonModule,
  MatCheckboxModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatRadioModule,
  MatSelectModule
];

@Component({
  selector: 'raw-financial-step',
  standalone: true,
  imports: MATERIAL_IMPORTS,
  templateUrl: './financial-step.component.html',
  styleUrls: ['./financial-step.component.scss']
})
export class FinancialStepComponent {

  @Input({ required: true }) group!: FormGroup;

  @Input() paymentPlans: PaymentPlan[] = [];

  @Input() transportationAreas: TransportationArea[] = [];

}
