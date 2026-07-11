import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
selector:'app-edit-doctor',
standalone:true,
imports:[CommonModule,FormsModule],
templateUrl:'./edit-doctor.html',
styleUrls: ['./edit-doctor.css', '../../../shared/finance/finance-ui.scss']
})
export class EditDoctor {

doctor = {

name:'Dr. Ahmed Ali',
specialty:'Psychiatrist',
phone:'0501234567',
email:'doctor@enhad.com',
status:'Active'

};

saveChanges(){

alert('Doctor Updated');

}

}