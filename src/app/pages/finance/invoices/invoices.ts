import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { InvoicesService } from '../../../core/finance/invoices.service';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './invoices.html',
  styleUrls: ['./invoices.css', '../../../shared/finance/finance-ui.scss']
})
export class Invoices implements OnInit {

  invoices:any[] = [];

  totalInvoices = 0;
  totalRevenue = 0;
  paidInvoices = 0;
  pendingInvoices = 0;

  constructor(
    private invoicesService: InvoicesService
  ) {}

  ngOnInit(){

    this.invoicesService
      .getInvoices()
      .subscribe((invoices:any[]) => {

        this.invoices = invoices;

    this.totalInvoices =
      this.invoices.length;

    this.totalRevenue =
      this.invoices.reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

    this.paidInvoices =
      this.invoices
      .filter(
        (i:any)=>i.status === 'Paid'
      )
      .reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

    this.pendingInvoices =
      this.invoices
      .filter(
        (i:any)=>i.status === 'Pending'
      )
      .reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

      });

  }

}
