import {createHash, randomBytes} from 'node:crypto';

export function id(prefix) {
  return prefix + randomBytes(12).toString('base64url');
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(bytes).digest('hex');
}

// Payout label derived from an account id. Not a key and not a signer.
export function addressOf(seed) {
  return '0x' + createHash('sha256').update(String(seed)).digest('hex').slice(0, 40);
}
