const PAYMENT_ENV = /^(STRIPE_|PAYMENT_|X402_)/i;

/** Child env never carries Stripe/x402 keys. PAYMENT_SENT stays false. */
export function childEnv(base = process.env) {
  const env = { ...base, PAYMENT_SENT: "false" };
  for (const key of Object.keys(env)) {
    if (key === "PAYMENT_SENT") continue;
    if (PAYMENT_ENV.test(key)) delete env[key];
  }
  return env;
}
