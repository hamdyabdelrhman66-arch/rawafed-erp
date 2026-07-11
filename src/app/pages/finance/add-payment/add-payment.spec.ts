import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-payment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './add-payment.html',
  styleUrls: ['./add-payment.css', '../../../shared/finance/finance-ui.scss']
})
export class AddPayment {

  patient = 'Ahmed Mohamed';

  amount = 0;

  method = 'Cash';

  notes = '';

}