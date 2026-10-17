import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

// Lost-signup readback window. The account session itself stays 24h.
export const RECOVERY_TTL_MS = 15 * 60 * 1000;

export function assertReplayKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw Object.assign(new Error('replay_key_required'), {codeName: 'replay_key_required'});
  }
  return Buffer.from(value, 'hex');
}

export function sealSecrets(keyHex, payload, nowMs) {
  const key = assertReplayKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify({
    recoveryCode: payload.recoveryCode,
    cookie: payload.cookie,
  }), 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ct: ct.toString('base64url'),
    expiresAt: new Date(nowMs + RECOVERY_TTL_MS).toISOString(),
  };
}

// Null means the ciphertext is missing, altered, or past expiresAt.
export function openSecrets(keyHex, sealed, nowMs) {
  if (!sealed || sealed.v !== 1 || sealed.alg !== 'aes-256-gcm' || typeof sealed.expiresAt !== 'string') return null;
  const expires = Date.parse(sealed.expiresAt);
  if (!Number.isFinite(expires) || expires <= nowMs) return null;
  try {
    const key = assertReplayKey(keyHex);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64url')), decipher.final()]);
    const parsed = JSON.parse(plain.toString('utf8'));
    if (typeof parsed.recoveryCode !== 'string' || typeof parsed.cookie !== 'string') return null;
    return {recoveryCode: parsed.recoveryCode, cookie: parsed.cookie};
  } catch {
    return null;
  }
}
