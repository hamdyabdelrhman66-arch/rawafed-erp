import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  constructor(private readonly finance: FinanceStorageService) {}

  getPatients() { return this.finance.getPatients(); }
  getPatient(id: number) { return this.finance.getPatient(id); }
  addPatient(patient: any) { return this.finance.addPatient(patient); }
  updatePatient(id: number, patient: any) { return this.finance.updatePatient(id, patient); }
  deletePatient(id: number) { return this.finance.deletePatient(id); }
}
