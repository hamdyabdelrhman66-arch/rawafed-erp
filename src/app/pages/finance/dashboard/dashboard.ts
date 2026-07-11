import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { AccountingService } from '../../../core/finance/accounting.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { StatusLabelPipe } from '../../../core/i18n/status-label.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    TranslatePipe,
    StatusLabelPipe
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../../../shared/finance/finance-ui.scss']
})
export class Dashboard implements OnInit {

  packages:any[] = [];
  payments:any[] = [];
  invoices:any[] = [];
  accountingDashboard:any;

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
    private invoicesService: InvoicesService,
    private accountingService: AccountingService,
    public readonly i18n: I18nService
  ) {}

  ngOnInit(){

    this.loadDashboard();

  }

  loadDashboard(){

    forkJoin({
      packages: this.patientPackagesService.getPackages(),
      payments: this.paymentsService.getPayments(),
      invoices: this.invoicesService.getInvoices(),
      accounting: this.accountingService.getDashboard().catch(() => null)
    }).subscribe(({ packages, payments, invoices, accounting }) => {

    this.packages = packages;
    this.payments = payments;
    this.invoices = invoices;
    this.accountingDashboard = accounting;

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

  get kpiCards(): any[] {
    const kpis = this.accountingDashboard?.kpis || {};
    return [
      { label: this.i18n.t('finance.kpi.total_revenue'), value: this.totalRevenue, suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.total_revenue_note'), icon: 'payments', tone: 'positive', route: '/finance/payments' },
      { label: this.i18n.t('finance.kpi.collections_today'), value: this.todayCollection, suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.collections_today_note'), icon: 'today', tone: 'neutral', route: '/finance/payments' },
      { label: this.i18n.t('finance.kpi.outstanding_receivables'), value: this.outstanding || Number(kpis.accountsReceivable || 0), suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.outstanding_receivables_note'), icon: 'account_balance_wallet', tone: 'warning', route: '/finance/patient-packages' },
      { label: this.i18n.t('finance.kpi.accounts_payable'), value: Number(kpis.accountsPayable || 0), suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.accounts_payable_note'), icon: 'request_quote', tone: 'negative', route: '/finance/suppliers' },
      { label: this.i18n.t('finance.kpi.cash_balance'), value: Number(kpis.cashBalance || 0), suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.cash_balance_note'), icon: 'point_of_sale', tone: 'neutral', route: '/finance/cashboxes' },
      { label: this.i18n.t('finance.kpi.bank_balance'), value: Number(kpis.bankBalance || 0), suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.bank_balance_note'), icon: 'account_balance', tone: 'neutral', route: '/finance/banks' },
      { label: this.i18n.t('finance.kpi.net_profit'), value: Number(kpis.netProfit || 0), suffix: this.i18n.t('currency.SAR'), note: this.i18n.t('finance.kpi.net_profit_note'), icon: 'trending_up', tone: Number(kpis.netProfit || 0) >= 0 ? 'positive' : 'negative', route: '/finance/accounting' },
      { label: this.i18n.t('nav.student_accounts'), value: this.activePackages, suffix: '', note: this.i18n.t('finance.kpi.student_accounts_note', { unpaid: this.unpaidPackages, partial: this.partialPackages }), icon: 'school', tone: 'neutral', route: '/finance/patient-packages' }
    ];
  }

  get revenueExpenseRows(): any[] {
    return (this.accountingDashboard?.charts?.revenueVsExpense || []).slice(-6);
  }

  get pendingApprovals(): number {
    return Number(this.accountingDashboard?.workflow?.pendingApprovals || 0);
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
