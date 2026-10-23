import { BadRequestException } from '@nestjs/common';

/**
 * Validates the Idempotency-Key header supplied with a transfer request.
 *
 * The key allows a client to safely retry a request without accidentally
 * executing the same transfer more than once.
 *
 * @param value - The Idempotency-Key header value.
 * @returns The validated idempotency key.
 * @throws BadRequestException when the key is missing or invalid.
 */
export function validateIdempotencyKey(value: string | undefined): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value ||
    value.trim().length === 0
  ) {
    throw new BadRequestException('A valid Idempotency-Key header is required');
  }

  return value;
}
