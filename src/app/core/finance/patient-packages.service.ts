import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';

@Injectable({ providedIn: 'root' })
export class PatientPackagesService {
  constructor(private readonly finance: FinanceStorageService) {}

  getPackages() { return this.finance.getPackages(); }
  getPackage(id: number) { return this.finance.getPackage(id); }
  addPackage(studentPackage: any) { return this.finance.addPackage(studentPackage); }
  updatePackage(id: number, studentPackage: any) { return this.finance.updatePackage(id, studentPackage); }
  deletePackage(id: number) { return this.finance.deletePackage(id); }
}
