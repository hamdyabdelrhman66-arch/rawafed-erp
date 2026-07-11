import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { StorageService } from '../services/storage.service';

export function duplicateValidator(
  storage: StorageService,
  field: 'nationalId' | 'passportNumber' | 'phone' | 'email',
  getIgnoreId: () => string | undefined
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value || '').trim();
    return storage.hasDuplicate(field, value, getIgnoreId()) ? { duplicate: true } : null;
  };
}
