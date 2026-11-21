// EIP-191 personal-sign recovery for an EOA. Contract wallets are not recovered here.
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl64(value, bits) {
  const x = BigInt(value);
  const n = bits & 63;
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & 0xffffffffffffffffn;
}

function keccak256(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const rate = 136;
  const state = Array.from({length: 25}, () => 0n);
  const padded = Buffer.alloc(Math.ceil((bytes.length + 1) / rate) * rate);
  bytes.copy(padded);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i += 1) {
      let lane = 0n;
      for (let b = 0; b < 8; b += 1) lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(8 * b);
      state[i] ^= lane;
    }
    for (let round = 0; round < 24; round += 1) {
      const c = Array.from({length: 5}, (_, x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]);
      const d = Array.from({length: 5}, (_, x) => c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1));
      for (let i = 0; i < 25; i += 1) state[i] ^= d[i % 5];
      const b = Array(25).fill(0n);
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[x + 5 * y], ROT[x][y]);
      }
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) {
          state[x + 5 * y] = b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y]);
        }
      }
      state[0] ^= RC[round];
    }
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i += 1) {
    let lane = state[i];
    for (let b = 0; b < 8; b += 1) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

function mod(value, modulus) {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

function modPow(base, exp, modulus) {
  let result = 1n;
  let value = mod(base, modulus);
  let power = exp;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}

function invert(value, modulus) {
  const result = modPow(value, modulus - 2n, modulus);
  if (mod(result * value, modulus) !== 1n) return null;
  return result;
}

function add(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.x === right.x) {
    if (left.y !== right.y || left.y === 0n) return null;
    const slope = mod(3n * left.x * left.x * invert(2n * left.y, P), P);
    const x = mod(slope * slope - 2n * left.x, P);
    return {x, y: mod(slope * (left.x - x) - left.y, P)};
  }
  const slope = mod((right.y - left.y) * invert(mod(right.x - left.x, P), P), P);
  const x = mod(slope * slope - left.x - right.x, P);
  return {x, y: mod(slope * (left.x - x) - left.y, P)};
}

function multiply(scalar, point) {
  let result = null;
  let addend = point;
  let factor = scalar;
  while (factor > 0n) {
    if (factor & 1n) result = add(result, addend);
    addend = add(addend, addend);
    factor >>= 1n;
  }
  return result;
}

function bytes32(value) {
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

function recoverPoint(hash, r, s, parity) {
  if (r <= 0n || r >= N || s <= 0n || s >= N) return null;
  const y2 = mod(modPow(r, 3n, P) + 7n, P);
  let y = modPow(y2, (P + 1n) / 4n, P);
  if (mod(y * y, P) !== y2) return null;
  if (Number(y & 1n) !== parity) y = P - y;
  const point = {x: r, y};
  if (multiply(N, point) !== null) return null;
  const hashInt = BigInt(`0x${hash.toString('hex')}`);
  const inverse = invert(r, N);
  if (!inverse) return null;
  const summed = add(multiply(s, point), multiply(mod(-hashInt, N), {x: GX, y: GY}));
  return multiply(inverse, summed);
}

export function recoverPersonalSigner(message, signature) {
  if (typeof message !== 'string' || typeof signature !== 'string' || !/^0x[0-9a-f]{130}$/.test(signature)) return null;
  const bytes = Buffer.from(signature.slice(2), 'hex');
  let parity = bytes[64];
  if (parity >= 27) parity -= 27;
  if (parity !== 0 && parity !== 1) return null;
  const prefix = Buffer.from(`\u0019Ethereum Signed Message:\n${Buffer.byteLength(message)}`);
  const hash = keccak256(Buffer.concat([prefix, Buffer.from(message)]));
  const point = recoverPoint(hash, BigInt(`0x${bytes.subarray(0, 32).toString('hex')}`), BigInt(`0x${bytes.subarray(32, 64).toString('hex')}`), parity);
  if (!point) return null;
  const body = keccak256(Buffer.concat([bytes32(point.x), bytes32(point.y)]));
  return `0x${body.subarray(12).toString('hex')}`;
}

export function fundingIntentMessage({tenant, chain, accountId, taskId, payer, recipient, token, grossAtomic, notBeforeBlock}) {
  return [
    'root71-hosted-wallet-market.funding-intent.v1',
    `tenant:${tenant}`,
    `chain:${chain}`,
    `account:${accountId}`,
    `task:${taskId}`,
    `payer:${payer}`,
    `recipient:${recipient}`,
    `token:${token}`,
    `gross:${grossAtomic}`,
    `notBeforeBlock:${notBeforeBlock}`,
  ].join('\n');
}

export function keccak256Hex(input) {
  return keccak256(input).toString('hex');
}
