import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PatientsService } from '../../../core/finance/patients.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
@Component({
  selector: 'app-edit-package',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-package.html',
  styleUrls: ['./edit-package.css', '../../../shared/finance/finance-ui.scss']
})
export class EditPackage {
  packageId = 0;
  packageData:any = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private patientsService: PatientsService,
    private patientPackagesService: PatientPackagesService
  ) {}
  ngOnInit(){

  this.packageId =
    Number(
      this.route.snapshot.paramMap.get('id')
    );

  forkJoin({
    patients: this.patientsService.getPatients(),
    selectedPackage: this.patientPackagesService.getPackage(this.packageId)
  }).subscribe(({ patients, selectedPackage }) => {

    this.patients = patients;
    this.packageData = selectedPackage || {};

    if(selectedPackage){

      this.selectedPatient =
        selectedPackage.patient;

      this.packageServices =
        selectedPackage.services || [];

      this.initialPayment =
        selectedPackage.paid || 0;

      this.discountPercent =
        selectedPackage.discountPercent || 0;

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
 patients:any[] = [];

  selectedPatient:any = '';

  
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

savePackage() {

  const maxSessions =
    this.packageServices.length
      ? Math.max(
          ...this.packageServices.map(
            (x:any)=>
              Number(x.sessions || 0)
          )
        )
      : 0;

  const updatedPackage = {
    ...this.packageData,
    patient:
      typeof this.selectedPatient === 'string'
        ? this.selectedPatient
        : this.selectedPatient?.name,
    patientId:
      this.packageData.patientId ||
      this.selectedPatient?.id,
    total:
      this.netTotal,
    paid:
      this.initialPayment,
    remaining:
      this.outstanding,
    sessions:
      `${this.packageData.usedSessions || 0} / ${maxSessions}`,
    status:
      this.initialPayment === 0
        ? 'Unpaid'
        : this.outstanding === 0
        ? 'Paid'
        : 'Partial',
    services:
      this.packageServices,
    discountPercent:
      this.discountPercent
  };

  this.patientPackagesService
    .updatePackage(this.packageId, updatedPackage)
    .subscribe(() => {
      alert('Package Updated Successfully');
      this.router.navigate(['/finance/package-details', this.packageId]);
    });

}
}
