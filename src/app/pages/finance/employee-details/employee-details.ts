import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector:'app-employee-details',
  standalone:true,
  imports:[CommonModule],
  templateUrl:'./employee-details.html',
  styleUrls: ['./employee-details.css', '../../../shared/finance/finance-ui.scss']
})
export class EmployeeDetails implements OnInit {

  employee:any = {};

  constructor(
    private route: ActivatedRoute,
    private readonly staffService: StaffService
  ) {}

  ngOnInit() {

    const id = this.route.snapshot.paramMap.get('id') || '';
    this.staffService.getStaffMember(id).subscribe((employee) => this.employee = employee || {});

  }

}
