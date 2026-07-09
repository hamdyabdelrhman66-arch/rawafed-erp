import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { InvoicesService } from '../../../core/finance/invoices.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../../../shared/finance/finance-ui.scss']
})
export class Dashboard implements OnInit {

  packages:any[] = [];
  payments:any[] = [];
  invoices:any[] = [];

  recentPayments:any[] = [];
  recentInvoices:any[] = [];
  topOutstanding:any[] = [];

  totalRevenue = 0;
  outstanding = 0;
  activePackages = 0;
  unpaidPackages = 0;
  partialPackages = 0;
  todayCollection = 0;

  endingSoon:any[] = [];
  expiredPackages:any[] = [];

  constructor(
    private patientPackagesService: PatientPackagesService,
    private paymentsService: PaymentsService,
    private invoicesService: InvoicesService
  ) {}

  ngOnInit(){

    this.loadDashboard();

  }

  loadDashboard(){

    forkJoin({
      packages: this.patientPackagesService.getPackages(),
      payments: this.paymentsService.getPayments(),
      invoices: this.invoicesService.getInvoices()
    }).subscribe(({ packages, payments, invoices }) => {

    this.packages = packages;
    this.payments = payments;
    this.invoices = invoices;

    this.totalRevenue =
      this.payments.reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount),
        0
      );

    const today =
      new Date()
      .toISOString()
      .split('T')[0];

    this.todayCollection =
      this.payments
      .filter(
        (p:any)=>
          p.date === today
      )
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount),
        0
      );

    this.outstanding =
      this.packages.reduce(
        (sum:number,p:any)=>
          sum + Number(p.remaining),
        0
      );

    this.activePackages =
      this.packages.length;

    this.unpaidPackages =
      this.packages.filter(
        x=>x.status === 'Unpaid'
      ).length;

    this.partialPackages =
      this.packages.filter(
        x=>x.status === 'Partial'
      ).length;

    this.recentPayments =
      [...this.payments]
      .reverse()
      .slice(0,5);

    this.recentInvoices =
      [...this.invoices]
      .reverse()
      .slice(0,5);

    this.topOutstanding =
      [...this.packages]
      .sort(
        (a,b)=>
          b.remaining -
          a.remaining
      )
      .slice(0,5);

    this.loadAlerts();

    });

  }

  loadAlerts(){

    const today =
      new Date();

    this.endingSoon = [];
    this.expiredPackages = [];

    this.packages.forEach((pkg:any)=>{

      if(!pkg.expectedEndDate){
        return;
      }

      const endDate =
        new Date(
          pkg.expectedEndDate
        );

      const diff =
        Math.ceil(
          (
            endDate.getTime() -
            today.getTime()
          )
          /
          (1000*60*60*24)
        );

      if(
        diff <= 14 &&
        diff >= 0
      ){

        this.endingSoon.push({

          patient:
            pkg.patient,

          endDate:
            pkg.expectedEndDate,

          days:
            diff

        });

      }

      if(diff < 0){

        this.expiredPackages.push({

          patient:
            pkg.patient,

          endDate:
            pkg.expectedEndDate,

          overdue:
            Math.abs(diff)

        });

      }

    });

  }

}
