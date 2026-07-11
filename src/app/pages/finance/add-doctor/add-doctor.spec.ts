import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-doctor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './add-doctor.html',
  styleUrls: ['./add-doctor.css', '../../../shared/finance/finance-ui.scss']
})
export class AddDoctor {

  staff = {

    name: '',

    position: '',

    phone: '',

    email: '',

    salary: 0,

    status: 'Active'

  };

  saveDoctor() {

    console.log(this.staff);

    alert('Staff Member Added Successfully');

  }

}