import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PatientsService } from '../../../core/finance/patients.service';

@Component({
  selector: 'app-add-patient',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-patient.html',
  styleUrls: ['./add-patient.css', '../../../shared/finance/finance-ui.scss']
})
export class AddPatient implements OnInit {

  patient:any = {
    name:'',
    phone:'',
    guardian:'',
    diagnosis:'',
    age:'',
    notes:''
  };

  patientId = 0;

  constructor(
    private route: ActivatedRoute,
    private router:Router,
    private patientsService: PatientsService
  ){}

  ngOnInit(){

    this.patientId =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    if(this.patientId){

      this.patientsService
        .getPatient(this.patientId)
        .subscribe((patient:any) => {
          this.patient = patient;
        });

    }

  }

  savePatient(){

    if(!this.patient.name){
      alert('Enter Patient Name');
      return;
    }

    const request =
      this.patientId
        ? this.patientsService.updatePatient(
            this.patientId,
            this.patient
          )
        : this.patientsService.addPatient(
            this.patient
          );

    request.subscribe(() => {
      alert(
        this.patientId
          ? 'Patient Updated'
          : 'Patient Added'
      );
      this.router.navigate(['/finance/patients']);
    });

  }

}
