import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

@Pipe({
  name: 'accountName',
  standalone: true,
  pure: false
})
export class AccountNamePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(account: { nameEn?: string; nameAr?: string } | null | undefined): string {
    if (!account) return '-';
    return this.i18n.label(account.nameEn || '-', account.nameAr);
  }
}
