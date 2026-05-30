import { Directive, ElementRef, HostListener, Input, OnInit, Optional, Self } from '@angular/core';
import { NgModel } from '@angular/forms';

/**
 * Applies comma-formatted display to every `<input type="number" ngModel>`.
 * - On focus  → shows plain number so the user can type naturally
 * - On blur   → re-formats with Intl.NumberFormat (commas, 2 dp)
 * - On input  → strips commas before writing the numeric value back to the model
 *
 * Also switches the element to type="text" + inputMode="numeric" so the
 * browser allows formatted strings while still showing a numeric keyboard.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'input[type="number"][ngModel]',
  standalone: true,
})
export class NumericFormatDirective implements OnInit {
  /** Number of decimal places to show on blur. Default 2. Use 4+ for FX rates. */
  @Input() numericFormatDecimals = 2;

  constructor(
    private el: ElementRef<HTMLInputElement>,
    @Self() @Optional() private model: NgModel,
  ) {}

  ngOnInit(): void {
    const el = this.el.nativeElement;
    el.type       = 'text';
    el.inputMode  = 'numeric';
    // Defer so ngModel has had a chance to write its initial value
    setTimeout(() => this.applyFormat(), 0);
  }

  @HostListener('focus')
  onFocus(): void {
    const val = this.model?.value;
    this.el.nativeElement.value =
      val != null && val !== '' && !isNaN(+val) && +val !== 0
        ? String(val)
        : '';
  }

  @HostListener('blur')
  onBlur(): void {
    this.applyFormat();
  }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement | null)?.value ?? '';
    // Strip commas and anything that isn't a digit, minus or decimal point
    const cleaned = raw.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const num     = cleaned === '' || cleaned === '-' ? null : parseFloat(cleaned);
    const value   = num == null || isNaN(num) ? null : num;
    this.model?.control?.setValue(value, { emitModelToViewChange: false });
    this.model?.viewToModelUpdate(value);
  }

  private applyFormat(): void {
    const val = this.model?.value;
    if (val == null || val === '' || isNaN(+val)) {
      this.el.nativeElement.value = '';
      return;
    }
    this.el.nativeElement.value = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: this.numericFormatDecimals,
      maximumFractionDigits: this.numericFormatDecimals,
    }).format(+val);
  }
}
