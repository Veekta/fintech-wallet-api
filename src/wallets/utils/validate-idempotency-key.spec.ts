import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateIdempotencyKey } from './validate-idempotency-key.js';

describe('validateIdempotencyKey', () => {
  it('accepts a valid key', () => {
    expect(validateIdempotencyKey('transfer-request-001')).toBe(
      'transfer-request-001',
    );
  });

  it('accepts a key with 128 characters', () => {
    const key = 'a'.repeat(128);

    expect(validateIdempotencyKey(key)).toBe(key);
  });

  it('rejects a missing key', () => {
    expect(() => validateIdempotencyKey(undefined)).toThrow(
      BadRequestException,
    );
  });

  it('rejects an empty or whitespace-only key', () => {
    expect(() => validateIdempotencyKey('')).toThrow(BadRequestException);
    expect(() => validateIdempotencyKey('   ')).toThrow(BadRequestException);
  });

  it('rejects keys longer than 128 characters', () => {
    expect(() => validateIdempotencyKey('a'.repeat(129))).toThrow(
      BadRequestException,
    );
  });

  it('rejects keys with leading or trailing whitespace', () => {
    expect(() => validateIdempotencyKey(' transfer-001')).toThrow(
      BadRequestException,
    );
    expect(() => validateIdempotencyKey('transfer-001 ')).toThrow(
      BadRequestException,
    );
  });
});
