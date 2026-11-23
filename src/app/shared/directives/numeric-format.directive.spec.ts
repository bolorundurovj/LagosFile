import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NumericFormatDirective } from './numeric-format.directive';

@Component({
  standalone: true,
  imports: [FormsModule, NumericFormatDirective],
  template: `
    <input id="amount" type="number" [(ngModel)]="amount" name="amount" />
    <input id="rate" type="number" [(ngModel)]="rate" name="rate" [numericFormatDecimals]="4" />
  `,
})
class HostComponent {
  amount: number | string | null = 1234567.5;
  rate: number | null = 1550.12345;
}

@Component({
  standalone: true,
  imports: [NumericFormatDirective],
  template: `<input id="bare" type="number" ngModel />`,
})
class BareHostComponent {}

describe('NumericFormatDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function input(id: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(`#${id}`);
  }

  function type(el: HTMLInputElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [HostComponent, BareHostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }));

  it('switches the input to a numeric text field and formats the initial value', () => {
    const el = input('amount');
    expect(el.type).toBe('text');
    expect(el.inputMode).toBe('numeric');
    expect(el.value).toBe('1,234,567.50');
  });

  it('honours numericFormatDecimals', () => {
    expect(input('rate').value).toBe('1,550.1235');
  });

  it('shows the raw number on focus and reformats on blur', fakeAsync(() => {
    const el = input('amount');
    el.dispatchEvent(new Event('focus'));
    expect(el.value).toBe('1234567.5');
    el.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('1,234,567.50');
  }));

  it('clears the field on focus when the value is zero, empty or not a number', fakeAsync(() => {
    const el = input('amount');
    for (const v of [0, '', 'abc', null]) {
      host.amount = v;
      fixture.detectChanges();
      tick();
      el.value = 'stale';
      el.dispatchEvent(new Event('focus'));
      expect(el.value).withContext(String(v)).toBe('');
    }
  }));

  it('blanks the display on blur when the model is empty or not a number', fakeAsync(() => {
    const el = input('amount');
    for (const v of [null, '', 'abc']) {
      host.amount = v;
      fixture.detectChanges();
      tick();
      el.value = 'stale';
      el.dispatchEvent(new Event('blur'));
      expect(el.value).withContext(String(v)).toBe('');
    }
  }));

  it('strips commas and stray characters before writing the number to the model', () => {
    type(input('amount'), '2,500,000.75');
    expect(host.amount).toBe(2_500_000.75);

    type(input('amount'), '₦ 1,000abc');
    expect(host.amount).toBe(1000);

    type(input('amount'), '-45.5');
    expect(host.amount).toBe(-45.5);
  });

  it('writes null for empty, lone minus and unparseable input', () => {
    type(input('amount'), '');
    expect(host.amount).toBeNull();

    host.amount = 5;
    type(input('amount'), '-');
    expect(host.amount).toBeNull();

    host.amount = 5;
    type(input('amount'), '.');
    expect(host.amount).toBeNull();
  });

  it('does not rewrite the view while typing', () => {
    const el = input('amount');
    type(el, '1,2');
    expect(host.amount).toBe(12);
    expect(el.value).toBe('1,2');
  });

  it('tolerates a missing NgModel', fakeAsync(() => {
    const bare = TestBed.createComponent(BareHostComponent);
    bare.detectChanges();
    tick();
    const el: HTMLInputElement = bare.nativeElement.querySelector('#bare');
    expect(el.type).toBe('text');
    expect(el.value).toBe('');
    el.value = '12';
    expect(() => el.dispatchEvent(new Event('input'))).not.toThrow();
    el.dispatchEvent(new Event('focus'));
    expect(el.value).toBe('');
    el.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('');
  }));
});
