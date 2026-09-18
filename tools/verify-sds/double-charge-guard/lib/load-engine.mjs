/**
 * Load published SDS payment-attempt + fulfill engines from this checkout.
 * Third-party SDKs (supabase/jose/resend/stripe) are replaced with unpaid
 * stubs so a cold clone does not need npm ci and never talks to Stripe.
 * Copied engine source is byte-identical to server/lib except the stubs.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STUB_SUPABASE = `// unpaid stub — double-charge-guard never opens Supabase
export const isSupabaseConfigured = () => false;
export function supabaseAdmin() {
  throw new Error("double-charge-guard unpaid: supabase stub; inject sb");
}
export async function verifySupabaseJwt() {
  throw new Error("double-charge-guard unpaid: jwt verify disabled");
}
`;

const STUB_NOTIFY = `// unpaid stub — fulfillment notifications are no-ops
export async function sendReceipt() { return; }
export async function sendWelcome() { return { skipped: true }; }
`;

export const ENGINE_COPIES = Object.freeze([
  { from: "server/pricing.js", to: "pricing.js" },
  { from: "server/lib/payment-attempt.js", to: "lib/payment-attempt.js" },
  { from: "server/lib/payment-attempt-store.js", to: "lib/payment-attempt-store.js" },
  { from: "server/lib/fulfill.js", to: "lib/fulfill.js" },
]);

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function hashFile(absPath) {
  return sha256Bytes(readFileSync(absPath));
}

let cached = null;

export async function loadPublishedEngine(repoRoot) {
  if (cached && cached.repoRoot === repoRoot) return cached.engine;

  const dest = mkdtempSync(join(tmpdir(), "sds-dcg-engine-"));
  mkdirSync(join(dest, "lib"), { recursive: true });

  const copies = [];
  for (const item of ENGINE_COPIES) {
    const from = join(repoRoot, item.from);
    const to = join(dest, item.to);
    copyFileSync(from, to);
    const sha256 = hashFile(from);
    if (hashFile(to) !== sha256) {
      throw new Error(`engine copy mismatch: ${item.from}`);
    }
    copies.push({ path: item.from, sha256, bytes: readFileSync(from).length });
  }

  writeFileSync(join(dest, "lib/supabase-admin.js"), STUB_SUPABASE);
  writeFileSync(join(dest, "lib/notify.js"), STUB_NOTIFY);

  const attemptMod = await import(pathToFileURL(join(dest, "lib/payment-attempt.js")).href);
  const storeMod = await import(pathToFileURL(join(dest, "lib/payment-attempt-store.js")).href);
  const fulfillMod = await import(pathToFileURL(join(dest, "lib/fulfill.js")).href);
  const pricingMod = await import(pathToFileURL(join(dest, "pricing.js")).href);

  const engine = {
    dest,
    copies,
    createOfferPaymentIntent: attemptMod.createOfferPaymentIntent,
    buildPaymentAttemptIdempotencyKey: attemptMod.buildPaymentAttemptIdempotencyKey,
    hashPaymentAttemptFacts: attemptMod.hashPaymentAttemptFacts,
    markPaymentAttemptSucceeded: attemptMod.markPaymentAttemptSucceeded,
    markPaymentAttemptCanceled: attemptMod.markPaymentAttemptCanceled,
    createMemoryPaymentAttemptStore: storeMod.createMemoryPaymentAttemptStore,
    PAYMENT_ATTEMPT_STATUS: storeMod.PAYMENT_ATTEMPT_STATUS,
    fulfillFromIntent: fulfillMod.fulfillFromIntent,
    orderIdForPaymentIntent: fulfillMod.orderIdForPaymentIntent,
    legacyOrderIdForUidOffer: fulfillMod.legacyOrderIdForUidOffer,
    getOffer: pricingMod.getOffer,
    CURRENCY: pricingMod.CURRENCY,
    OFFERS: pricingMod.OFFERS,
  };

  cached = { repoRoot, engine };
  return engine;
}
