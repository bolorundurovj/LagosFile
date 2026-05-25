import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'naira', standalone: true })
export class NairaPipe implements PipeTransform {
  transform(value: number | null | undefined, showSymbol = true): string {
    if (value == null) return showSymbol ? '₦—' : '—';
    const formatted = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return showSymbol ? `₦${formatted}` : formatted;
  }
}
