import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { TransferDto } from './transfer.dto.js';

describe('TransferDto', () => {
  async function validateInput(destinationWalletId: string, amount: string) {
    const dto = Object.assign(new TransferDto(), {
      destinationWalletId,
      amount,
    });

    return validate(dto);
  }

  it('accepts a valid destination wallet and amount', async () => {
    const errors = await validateInput(
      '550e8400-e29b-41d4-a716-446655440000',
      '2500.50',
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid destination wallet ID', async () => {
    const errors = await validateInput('not-a-uuid', '2500.50');

    expect(
      errors.some((error) => error.property === 'destinationWalletId'),
    ).toBe(true);
  });

  it('rejects negative amounts', async () => {
    const errors = await validateInput(
      '550e8400-e29b-41d4-a716-446655440000',
      '-100.00',
    );

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects amounts with more than two decimal places', async () => {
    const errors = await validateInput(
      '550e8400-e29b-41d4-a716-446655440000',
      '100.123',
    );

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects zero', async () => {
    const errors = await validateInput(
      '550e8400-e29b-41d4-a716-446655440000',
      '0',
    );

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });
});
