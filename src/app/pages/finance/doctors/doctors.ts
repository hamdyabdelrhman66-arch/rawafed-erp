import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector: 'app-doctors',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './doctors.html',
  styleUrls: ['./doctors.css', '../../../shared/finance/finance-ui.scss']
})
export class Doctors implements OnInit {

  staffList: any[] = [];

  constructor(private readonly staffService: StaffService) {}

  ngOnInit(){

  this.staffService.getStaff().subscribe((staff) => this.staffList = staff);

}
deleteStaff(id:number | string){

  if(!confirm('Delete this staff member?')){
    return;
  }

  this.staffService.deleteStaff(id).subscribe(() => {
    this.staffList = this.staffList.filter((s:any)=>s.id !== id);
  });

}

}
