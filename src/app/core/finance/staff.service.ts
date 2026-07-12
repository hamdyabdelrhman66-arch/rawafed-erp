import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class StaffService {
  constructor(private readonly api: ApiService) {}

  getStaff(): Observable<any[]> {
    return from(this.api.get<any[]>('/staff'));
  }

  getStaffMember(id: string | number): Observable<any | undefined> {
    return new Observable((subscriber) => {
      this.getStaff().subscribe((staff) => {
        subscriber.next(staff.find((item) => String(item.id) === String(id)));
        subscriber.complete();
      });
    });
  }

  addStaff(staff: any): Observable<any> {
    return from(this.api.post<any>('/staff', staff));
  }

  updateStaff(id: string | number, staff: any): Observable<any> {
    return from(this.api.patch<any>(`/staff/${id}`, staff));
  }

  deleteStaff(id: string | number): Observable<void> {
    return from(this.api.delete<void>(`/staff/${id}`));
  }

  getPayrollRuns(): Observable<any[]> {
    return from(this.api.get<any[]>('/payroll/runs'));
  }

  createPayrollRun(payload: any): Observable<any> {
    return from(this.api.post<any>('/payroll/runs', payload));
  }
}
