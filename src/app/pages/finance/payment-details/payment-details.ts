import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';
@Component({
  selector: 'app-payment-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-details.html',
  styleUrls: ['./payment-details.css', '../../../shared/finance/finance-ui.scss']
})
export class PaymentDetails implements OnInit {

  printReceipt() {
    window.print();
  }
payment:any;

constructor(
  private route: ActivatedRoute,
  private paymentsService: PaymentsService
){}

ngOnInit(){

  const id = Number(this.route.snapshot.paramMap.get('id'));

  this.paymentsService
    .getPayment(id)
    .subscribe((payment:any) => {
      this.payment = payment;
      if (payment && this.route.snapshot.queryParamMap.get('print') === '1') {
        window.setTimeout(() => this.printReceipt(), 100);
      }
    });

}
}
