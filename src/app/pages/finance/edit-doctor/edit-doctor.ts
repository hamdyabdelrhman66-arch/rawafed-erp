import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector: 'app-edit-doctor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './edit-doctor.html',
  styleUrls: ['./edit-doctor.css', '../../../shared/finance/finance-ui.scss']
})
export class EditDoctor implements OnInit {

  staff:any = {};

  constructor(
    private route: ActivatedRoute,
    private readonly staffService: StaffService
  ) {}

  ngOnInit() {

    const id = this.route.snapshot.paramMap.get('id') || '';
    this.staffService.getStaffMember(id).subscribe((staff) => this.staff = staff || {});

  }

  saveChanges() {
    if(this.staff?.id){
      this.staffService.updateStaff(this.staff.id, this.staff).subscribe(() => {
      alert('Staff Updated Successfully');
      });
    }

  }

}
