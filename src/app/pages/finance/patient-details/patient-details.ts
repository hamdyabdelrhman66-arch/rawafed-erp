import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PatientsService } from '../../../core/finance/patients.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';

@Component({
  selector:'app-patient-details',
  standalone:true,
  imports:[CommonModule],
  templateUrl:'./patient-details.html',
  styleUrls: ['./patient-details.css', '../../../shared/finance/finance-ui.scss']
})
export class PatientDetails implements OnInit {

  patient:any;

  packages:any[]=[];

  constructor(
    private route:ActivatedRoute,
    private patientsService: PatientsService,
    private patientPackagesService: PatientPackagesService
  ){}

  ngOnInit(){

    const id =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    forkJoin({
      patient: this.patientsService.getPatient(id),
      packages: this.patientPackagesService.getPackages()
    }).subscribe(({ patient, packages }) => {

      this.patient = patient;

      this.packages =
        packages.filter(
          (x:any)=>
            x.patientId === id ||
            x.patient === this.patient?.name
        );

    });

  }

}
