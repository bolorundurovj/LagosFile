import { NairaPipe } from './naira.pipe';

describe('NairaPipe', () => {
  let pipe: NairaPipe;

  beforeEach(() => {
    pipe = new NairaPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('transform with number should format with naira symbol and 2 decimals', () => {
    expect(pipe.transform(1234.5)).toBe('₦1,234.50');
  });

  it('transform with null should return ₦—', () => {
    expect(pipe.transform(null)).toBe('₦—');
  });

  it('transform with undefined should return ₦—', () => {
    expect(pipe.transform(undefined)).toBe('₦—');
  });

  it('transform with showSymbol false should omit ₦', () => {
    expect(pipe.transform(1234.5, false)).toBe('1,234.50');
  });

  it('transform with zero should return ₦0.00', () => {
    expect(pipe.transform(0)).toBe('₦0.00');
  });
});