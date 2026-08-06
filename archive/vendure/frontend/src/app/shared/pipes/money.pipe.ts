import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyService } from '../services/currency.service';

@Pipe({
  name: 'money',
  standalone: true,
  pure: true,
})
export class MoneyPipe implements PipeTransform {
  private readonly currencyService = inject(CurrencyService);

  transform(amount: number | null | undefined, showCurrency: boolean = true): string {
    return this.currencyService.format(amount ?? 0, showCurrency);
  }
}
