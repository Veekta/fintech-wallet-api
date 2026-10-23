import { describe, expect, it } from 'vitest';
import { normalizeAmount } from './normalize-amount.js';

describe('normalizeAmount', () => {
  it.each([
    ['100', '100.00'],
    ['100.5', '100.50'],
    ['100.50', '100.50'],
    ['0.01', '0.01'],
    ['10.25', '10.25'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });
});
