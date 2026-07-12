import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

@Pipe({
  name: 'statusLabel',
  standalone: true,
  pure: false
})
export class StatusLabelPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(value: string | null | undefined): string {
    return this.i18n.status(value);
  }
}
