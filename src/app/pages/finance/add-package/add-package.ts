import { Component, OnInit } from '@angular/core';import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PatientsService } from '../../../core/finance/patients.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { InvoicesService } from '../../../core/finance/invoices.service';

@Component({
  selector: 'app-add-package',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-package.html',
  styleUrls: ['./add-package.css', '../../../shared/finance/finance-ui.scss']
})
export class AddPackage implements OnInit {
  constructor(
  private route: ActivatedRoute,
  private patientsService: PatientsService,
  private patientPackagesService: PatientPackagesService,
  private paymentsService: PaymentsService,
  private invoicesService: InvoicesService
){}
  ngOnInit(){

  const patientId =
    Number(
      this.route.snapshot.paramMap.get('id')
    );

  this.patientsService
    .getPatients()
    .subscribe((patients:any[]) => {

      this.patients = patients;

      if(patientId){

        this.selectedPatient =
          this.patients.find(
            (p:any)=>
              p.id === patientId
          );

      }

    });


}
  onServiceChange(item: any) {

  const selectedService = this.serviceTypes.find(
    service => service.name === item.service
  );

  if (selectedService) {
    item.price = selectedService.price;
  }

}
  

  selectedPatient:any=null;

patients:any[]=[];

  
    serviceTypes = [
  { id: 1, name: 'تحليل سلوك ABA', price: 300 },
  { id: 2, name: 'تخاطب', price: 200 },
  { id: 3, name: 'تعديل سلوك', price: 200 },
  { id: 4, name: 'تنمية مهارات', price: 200 },
  { id: 5, name: 'صعوبات تعلم', price: 200 },
  { id: 6, name: 'علاج وظيفي', price: 250 }
];

  packageServices: any[] = [];

  addService() {
   this.packageServices.push({
  service: '',
  sessions: 12,
  price: 0,
  customPrice: false
});
  }

  get subtotal() {
    return this.packageServices.reduce(
      (sum, item) => sum + (item.sessions * item.price),
      0
    );
  }
  removeService(item: any) {

  this.packageServices =
    this.packageServices.filter(
      x => x !== item
    );

}
discountPercent = 0;

initialPayment = 0;
packageStartDate =
  new Date()
    .toISOString()
    .split('T')[0];

sessionsPerWeek = 3;
get discountAmount() {
  return this.subtotal *
    (this.discountPercent / 100);
}

get netTotal() {
  return this.subtotal -
    this.discountAmount;
}

get outstanding() {
  return this.netTotal -
    this.initialPayment;
    
}
get expectedEndDate() {

  if(
    this.packageServices.length === 0
  ){
    return '';
  }

  const maxSessions =
    Math.max(
      ...this.packageServices.map(
        (x:any)=>
          Number(x.sessions || 0)
      )
    );

  if(
    maxSessions === 0 ||
    this.sessionsPerWeek <= 0
  ){
    return '';
  }

  const totalDays =
    Math.ceil(
      (maxSessions /
      this.sessionsPerWeek) * 7
    );

  const endDate =
    new Date(
      this.packageStartDate
    );

  endDate.setDate(
    endDate.getDate() +
    totalDays
  );

  return endDate
    .toISOString()
    .split('T')[0];

}
savePackage() {
  const packageId = Date.now();
  if(!this.selectedPatient){

    alert('Select Patient');

    return;

  }

  const maxSessions =
Math.max(
  ...this.packageServices.map(
    (x:any)=>
      Number(x.sessions)
  )
);
const expectedEnd =
  this.expectedEndDate;

const patientPackage = {

  id: packageId,

  patientId:
    this.selectedPatient.id,

  patient:
    this.selectedPatient.name,

  startDate:
    this.packageStartDate,

  sessionsPerWeek:
    this.sessionsPerWeek,

  expectedEndDate:
    expectedEnd,

  total:
    this.netTotal,

  paid:
    this.initialPayment,

  remaining:
    this.outstanding,

  usedSessions: 0,

  progress: 0,

  sessions:
    '0 / ' + maxSessions,

  status:
    this.initialPayment === 0
      ? 'Unpaid'
      : this.outstanding === 0
      ? 'Paid'
      : 'Partial',

  services:
    this.packageServices

};

this.patientPackagesService
  .addPackage(patientPackage)
  .subscribe();

/* PAYMENT */

if(this.initialPayment > 0){

  const paymentId = Date.now();

  this.paymentsService.addPayment({

    id: paymentId,

    receipt:
      'REC-' + paymentId,

    patient:
      this.selectedPatient.name ||
      this.selectedPatient,

    package: 'Package',

    amount:
      this.initialPayment,

    method: 'Cash',

    date:
      new Date()
      .toISOString()
      .split('T')[0],

    status: 'Completed'

  }).subscribe();

}

/* INVOICE */

this.invoicesService.addInvoice({

  id: packageId,

  invoiceNumber:
    'INV-' + Date.now(),

  patient:
    this.selectedPatient.name ||
    this.selectedPatient,

  service: 'Package',

  amount:
    this.netTotal,

  date:
    new Date()
    .toISOString()
    .split('T')[0],

  status:
    this.outstanding === 0
      ? 'Paid'
      : 'Pending'

}).subscribe();

alert('Package Saved Successfully');
}
}
