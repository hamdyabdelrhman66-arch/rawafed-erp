import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';
@Component({
  selector: 'app-payment-details',
  standalone: true,
  templateUrl: './payment-details.html',
  styleUrls: ['./payment-details.css', '../../../shared/finance/finance-ui.scss']
})
export class PaymentDetails {

  printReceipt() {
    window.print();
  }
payment:any;

constructor(
  private route: ActivatedRoute,
  private paymentsService: PaymentsService
){}

ngOnInit(){

  const id =
    Number(
      this.route.snapshot.paramMap.get('id')
    );

  this.paymentsService
    .getPayment(id)
    .subscribe((payment:any) => {
      this.payment = payment;
    });

}
}
