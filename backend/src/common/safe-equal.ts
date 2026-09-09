import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first makes the buffers
 * equal length, which timingSafeEqual requires, without leaking length info.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
