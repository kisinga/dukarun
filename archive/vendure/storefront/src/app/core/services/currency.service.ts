import { Injectable } from '@angular/core';

/** Formats Vendure Money values (minor units, e.g. cents) into a localized currency string. */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  format(amountMinor: number | null | undefined, currencyCode = 'KES'): string {
    if (amountMinor == null) return '';
    const major = amountMinor / 100;
    try {
      return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(major);
    } catch {
      return `${currencyCode} ${major.toFixed(2)}`;
    }
  }

  /** Format a shop-api search price, which is either a single price or a min–max range. */
  formatSearchPrice(
    price: { min: number; max: number } | { value: number },
    currencyCode = 'KES'
  ): string {
    if ('value' in price && typeof price.value === 'number') {
      return this.format(price.value, currencyCode);
    }
    if ('min' in price && typeof price.min === 'number' && typeof price.max === 'number') {
      if (price.min === price.max) return this.format(price.min, currencyCode);
      return `${this.format(price.min, currencyCode)} – ${this.format(price.max, currencyCode)}`;
    }
    return '';
  }
}
