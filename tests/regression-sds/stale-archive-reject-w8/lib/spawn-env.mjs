/** Drop payment/secret keys before spawning obtain-archive. */
export function spawnEnv(base = process.env) {
  const out = { ...base };
  for (const key of Object.keys(out)) {
    if (/stripe|x402|payment|sk_live|sk_test|secret|webhook/i.test(key)) {
      delete out[key];
    }
  }
  return out;
}
