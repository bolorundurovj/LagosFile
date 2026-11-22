import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers/ext-mocks.mjs';

const core = loadScript('chrome', 'autofill-core.js');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('autofill-core: visibility', () => {
  it('honours the native checkVisibility result and survives it throwing', () => {
    document.body.innerHTML = '<input id="a" type="text">';
    const el = document.getElementById('a');
    el.checkVisibility = vi.fn(() => false);
    expect(core.isVisibleElement(el)).toBe(false);
    expect(el.checkVisibility).toHaveBeenCalledWith({ checkOpacity: false, checkVisibilityCSS: true });

    el.checkVisibility = () => {
      throw new Error('unsupported');
    };
    expect(core.isVisibleElement(el)).toBe(true);
    el.checkVisibility = () => true;
    expect(core.isVisibleElement(el)).toBe(true);
  });

  it('rejects hidden ancestors by attribute, class and style', () => {
    document.body.innerHTML = `
      <div hidden><input id="h1"></div>
      <div aria-hidden="true"><input id="h2"></div>
      <div class="d-none"><input id="h3"></div>
      <div style="visibility:hidden"><input id="h4"></div>
      <div class="tab-pane show"><input id="v1"></div>`;
    ['h1', 'h2', 'h3', 'h4'].forEach((id) => expect(core.isVisibleElement(document.getElementById(id))).toBe(false));
    expect(core.isVisibleElement(document.getElementById('v1'))).toBe(true);
    expect(core.isVisibleElement(null)).toBe(false);
    expect(core.isVisibleElement(document.createTextNode('x'))).toBe(false);
  });

  it('rejects non-text, disabled and readonly inputs', () => {
    document.body.innerHTML = `
      <input id="s" type="submit"><input id="c" type="checkbox"><input id="f" type="file">
      <input id="d" disabled><input id="r" readonly><input id="n" type="number">`;
    ['s', 'c', 'f', 'd', 'r'].forEach((id) => expect(core.isVisibleInput(document.getElementById(id))).toBe(false));
    expect(core.isVisibleInput(document.getElementById('n'))).toBe(true);
    expect(core.isVisibleInput(document.body)).toBe(false);
  });
});

describe('autofill-core: byLabel strategies', () => {
  it('finds inputs next to table-cell labels or elsewhere in the row', () => {
    document.body.innerHTML = `
      <table>
        <tr><td>Employment</td><td><input id="t1"></td></tr>
        <tr><th>Dividend</th><td><span>x</span></td><td><input id="t2"></td></tr>
        <tr><td>Rent</td></tr>
        <tr><td class="d-none">Interest</td><td><input id="t3"></td></tr>
      </table>`;
    expect(core.byLabel('Employment', document).id).toBe('t1');
    expect(core.byLabel('Dividend:', document).id).toBe('t2');
    expect(core.byLabel('Rent', document)).toBeNull();
    expect(core.byLabel('Interest', document)).toBeNull();
  });

  it('finds inputs next to plain text nodes', () => {
    document.body.innerHTML = '<div class="row"><span>Royalty</span><input id="s1"></div>';
    expect(core.byLabel('Royalty', document).id).toBe('s1');
  });

  it('falls back to aria-label and placeholder', () => {
    document.body.innerHTML = `
      <input id="hid" type="hidden" aria-label="PAYE">
      <input id="a1" aria-label="PAYE">
      <input id="p1" placeholder="WHT Others *">`;
    expect(core.byLabel('PAYE', document).id).toBe('a1');
    expect(core.byLabel('WHT Others', document).id).toBe('p1');
    expect(core.byLabel('Nothing Here', document)).toBeNull();
  });

  it('uses the label sibling or a single input inside it', () => {
    document.body.innerHTML = `
      <div><label>Pensions</label><div><input id="sib"></div></div>
      <div><label>Bonus <input id="in"></label></div>
      <div><label>Losses</label><input id="direct"></div>`;
    expect(core.byLabel('Pensions', document).id).toBe('sib');
    expect(core.byLabel('Losses', document).id).toBe('direct');
  });

  it('stops walking up when an ancestor has several inputs and handles empty labels', () => {
    document.body.innerHTML = '<section><section><label>Rent</label></section><input><input></section>';
    expect(core.byLabel('Rent', document)).toBeNull();
    expect(core.byLabel('', document)).toBeNull();
    expect(core.byLabel('Rent')).toBeNull();
  });
});

describe('autofill-core: setFieldValue framework hooks', () => {
  it('strips commas, fires input and change events, and calls React onChange', () => {
    document.body.innerHTML = '<input id="x">';
    const el = document.getElementById('x');
    const events = [];
    el.addEventListener('input', (e) => events.push(e.type + ':' + e.data));
    el.addEventListener('change', (e) => events.push(e.type));
    const onChange = vi.fn();
    el.__reactFiber$abc = { memoizedProps: { onChange } };
    expect(core.setFieldValue(el, ' 1,234,567 ')).toBe(true);
    expect(el.value).toBe('1234567');
    expect(events).toEqual(['input:1234567', 'change']);
    expect(onChange).toHaveBeenCalledWith({ target: el, type: 'change' });
  });

  it('uses the parent fiber props and tolerates throwing handlers', () => {
    document.body.innerHTML = '<input id="x">';
    const el = document.getElementById('x');
    const onChange = vi.fn(() => {
      throw new Error('react');
    });
    el.__reactInternalInstance$q = { return: { memoizedProps: { onChange } } };
    expect(core.setFieldValue(el, '5')).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('updates Angular controls found in __ngContext__', () => {
    document.body.innerHTML = '<input id="x">';
    const el = document.getElementById('x');
    const control = { setValue: vi.fn(), markAsDirty: vi.fn(), updateValueAndValidity: vi.fn() };
    const a = { _onChange: vi.fn() };
    const b = { onChange: vi.fn(), control };
    const c = { _onChange: () => { throw new Error('x'); }, control: { setValue: () => { throw new Error('y'); } } };
    const d = { onChange: () => { throw new Error('z'); } };
    el.__ngContext__ = [null, 3, a, b, c, d];
    core.setFieldValue(el, '9,000');
    expect(a._onChange).toHaveBeenCalledWith('9000');
    expect(b.onChange).toHaveBeenCalledWith('9000');
    expect(control.setValue).toHaveBeenCalledWith('9000', { emitEvent: false, emitViewToModelChange: false });
    expect(control.markAsDirty).toHaveBeenCalled();
    expect(control.updateValueAndValidity).toHaveBeenCalledWith({ emitEvent: false });
  });

  it('falls back to plain value assignment and Event when no view is available', () => {
    const el = { value: '', dispatchEvent: vi.fn(), ownerDocument: null };
    const view = { Event };
    expect(core.setFieldValue(el, '42', view)).toBe(true);
    expect(el.value).toBe('42');
    expect(el.dispatchEvent.mock.calls.map((c) => c[0].type)).toEqual(['input', 'change']);
    expect(core.setFieldValue(null, '1')).toBe(false);
  });
});

describe('autofill-core: edge cases', () => {
  it('returns empty results for missing filings or unknown steps', () => {
    expect(core.injectStep('income', null, document)).toMatchObject({ ok: false, tabName: 'Income', done: 0 });
    expect(core.injectStep('bogus', null, document).tabName).toBe('bogus');
    expect(core.injectStep('bogus', {}, document)).toMatchObject({ ok: false, tabName: 'bogus' });
    expect(core.activateTab('bogus', document)).toBe(false);
    expect(core.getPath(null, 'a')).toBeUndefined();
    expect(core.getManualFields(null)).toEqual([]);
  });

  it('adds accommodation dates and foreign income to manual fields', () => {
    const items = core.getManualFields({
      accommodation: { rentPaid: 1000, dateStarted: '2025-01-01', dateEnd: '2025-12-31' },
      income: { foreignIncomes: [{ currency: 'USD', totalAmount: 100, nairaEquivalent: 150000 }, null, { nairaEquivalent: 0 }] },
    });
    expect(items[0].hint).toContain('(2025-01-01 to 2025-12-31)');
    expect(items[1].label).toBe('Foreign Income (USD)');
    expect(items[1].displayValue).toBe('100 USD · ₦150,000');
    expect(items).toHaveLength(2);
  });

  it('derives a foreign income entry from the legacy single-object shape', () => {
    const items = core.getManualFields({ income: { foreignIncome: { nairaEquivalent: 5000 } } });
    expect(items).toEqual([
      expect.objectContaining({ label: 'Foreign Income (FX)', rawValue: '5000', displayValue: '₦5,000' }),
    ]);
  });
});
