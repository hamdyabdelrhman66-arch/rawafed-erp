import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router
} from '@angular/router';
import { InvoicesService } from '../../../core/finance/invoices.service';

@Component({
  selector: 'app-edit-invoice',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './edit-invoice.html',
  styleUrls: ['./edit-invoice.css', '../../../shared/finance/finance-ui.scss']
})
export class EditInvoice implements OnInit {

  invoice:any = {};

  invoices:any[] = [];

  invoiceId = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invoicesService: InvoicesService
  ) {}

  ngOnInit(): void {

    this.invoiceId =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    this.invoicesService
      .getInvoice(this.invoiceId)
      .subscribe((foundInvoice:any) => {

    if(foundInvoice){

      this.invoice = {
        ...foundInvoice
      };

    }

      });

  }

  saveInvoice(): void {

    this.invoicesService
      .updateInvoice(this.invoiceId, this.invoice)
      .subscribe(() => {

      alert(
        'Invoice Updated Successfully'
      );

      this.router.navigate([
        '/finance/invoice-details',
        this.invoiceId
      ]);

      });

  }

}
