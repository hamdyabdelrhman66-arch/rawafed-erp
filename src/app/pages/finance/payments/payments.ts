import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './payments.html',
  styleUrls: ['./payments.css', '../../../shared/finance/finance-ui.scss']
})
export class Payments implements OnInit {

  payments:any[] = [];

  todayCollection = 0;
  monthlyCollection = 0;
  cashPayments = 0;
  bankTransfers = 0;

  constructor(
    private paymentsService: PaymentsService
  ) {}

  ngOnInit(){

    this.paymentsService
      .getPayments()
      .subscribe((payments:any[]) => {

        this.payments = payments;

    const today =
      new Date().toISOString().split('T')[0];

    const currentMonth =
      new Date().getMonth();

    this.todayCollection =
      this.payments
      .filter((p:any)=>p.date === today)
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.monthlyCollection =
      this.payments
      .filter((p:any)=>{

        if(!p.date) return false;

        return (
          new Date(p.date).getMonth()
          === currentMonth
        );

      })
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.cashPayments =
      this.payments
      .filter(
        (p:any)=>
          p.method === 'Cash'
      )
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.bankTransfers =
      this.payments
      .filter(
        (p:any)=>
          p.method === 'Bank Transfer' ||
          p.method === 'Transfer' ||
          p.method === 'Bank'
      )
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

      });

  }

  printReceipt() {

    const printWindow =
      window.open(
        '/finance/payment-details',
        '_blank'
      );

    if (printWindow) {

      printWindow.onload = () => {

        printWindow.print();

      };

    }

  }

}
