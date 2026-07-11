import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector:'app-doctor-details',
  standalone:true,
  imports:[
    CommonModule,
    RouterLink
  ],
  templateUrl:'./doctor-details.html',
  styleUrls: ['./doctor-details.css', '../../../shared/finance/finance-ui.scss']
})
export class DoctorDetails implements OnInit {

  staff:any = {};

  constructor(
    private route: ActivatedRoute,
    private readonly staffService: StaffService
  ) {}

  ngOnInit() {

    const id = this.route.snapshot.paramMap.get('id') || '';
    this.staffService.getStaffMember(id).subscribe((staff) => this.staff = staff || {});

  }

}
