import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PatientsService } from '../../../core/finance/patients.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports:[
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl:'./patients.html',
  styleUrls: ['./patients.css', '../../../shared/finance/finance-ui.scss']
})
export class Patients implements OnInit {

  patients:any[]=[];
  filteredPatients:any[]=[];

  search='';

  constructor(
    private patientsService: PatientsService,
    private patientPackagesService: PatientPackagesService
  ) {}

  ngOnInit(){

    this.loadPatients();

  }
loadPatients(){

  console.log('LOAD PATIENTS START');

  forkJoin({
    patients: this.patientsService.getPatients(),
    packages: this.patientPackagesService.getPackages()
  }).subscribe({

    next: ({ patients, packages }) => {

      console.log('PATIENTS =>', patients);
      console.log('PACKAGES =>', packages);

      this.patients = patients;
this.filteredPatients = [...patients];
      this.filteredPatients =
        this.patients.map((patient:any)=>({

          ...patient,

          hasPackage:
            packages.some(
              (p:any)=> p.patientId === patient.id
            ),

          packageId:
            packages.find(
              (p:any)=> p.patientId === patient.id
            )?.id

        }));

    },

    error: (err) => {
      console.error('FORKJOIN ERROR', err);
    }

  });

}

  deletePatient(id:number){

    if(!confirm('Delete this patient?')){
      return;
    }

    this.patientsService
      .deletePatient(id)
      .subscribe(() => this.loadPatients());

  }
  searchPatients(){

    this.filteredPatients =
      this.patients.filter(
        p =>
          p.name
          .toLowerCase()
          .includes(
            this.search.toLowerCase()
          )
      );

  }

}
