/**
 * Thin wrapper over the EXISTING customer-x402 purchase/preflight modules.
 * Requires a patched customer-x402 tree (see overlay.mjs). Does not create wallets.
 */
import { loadCustomerX402 } from "./overlay.mjs";
import { normalizeLockfileAuthorization } from "./lockfile-authorization.mjs";

export async function runLockfilePreflight({
  authorization,
  fetchImpl,
  customerX402Root,
} = {}) {
  const client = await loadCustomerX402(customerX402Root);
  const auth = client.normalizeAuthorization(authorization);
  return client.runPreflight({
    authorization: auth,
    url: auth.url,
    fetchImpl,
    method: "POST",
  });
}

export async function runLockfilePurchase({
  authorization,
  account = null,
  privateKey = null,
  fetchImpl,
  approve = false,
  timeoutMs = 15_000,
  attemptReceiptPath = null,
  customerX402Root,
} = {}) {
  const client = await loadCustomerX402(customerX402Root);
  return client.runAuthorizedPurchase({
    authorization,
    url: authorization.url,
    account,
    privateKey,
    fetchImpl,
    approve,
    timeoutMs,
    attemptReceiptPath,
  });
}

export { normalizeLockfileAuthorization };
