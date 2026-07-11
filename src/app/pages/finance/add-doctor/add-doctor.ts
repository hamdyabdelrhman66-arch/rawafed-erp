import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffService } from '../../../core/finance/staff.service';

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

    department: '',

    phone: '',

    email: '',

    salary: 0,

    startDate: '',

    nationality: '',

    idNumber: '',

    status: 'Active',

    notes: ''

  };

 constructor(private readonly staffService: StaffService) {}

 saveDoctor() {
  this.staffService.addStaff(this.staff).subscribe(() => {
    alert('Staff Added Successfully');
  });

}
}
