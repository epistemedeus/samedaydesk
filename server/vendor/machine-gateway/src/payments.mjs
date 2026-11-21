import { ajv, object, text, requirementsSchema } from "./schemas.mjs";
import { boundedJson, canonical, digest } from "./util.mjs";
import { fail } from "./errors.mjs";
import { invokeFacilitator } from "./facilitator-io.mjs";

const address = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
const uint = { ...text(32), pattern: "^[0-9]+$" };
const authorizationSchema = object({
  from: address, to: address, value: uint, validAfter: uint, validBefore: uint,
  nonce: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
});
const resourceSchema = object({
  url: text(2048), description: { type: "string", maxLength: 2048 }, mimeType: text(256),
  serviceName: text(32), tags: { type: "array", maxItems: 5, items: text(32) }, iconUrl: { type: "string", maxLength: 2048 },
}, ["url"]);
const validPayload = ajv.compile(object({
  x402Version: { const: 2 }, accepted: requirementsSchema,
  payload: object({ signature: { type: "string", minLength: 132, maxLength: 132, pattern: "^0x[0-9a-fA-F]+$" }, authorization: authorizationSchema }),
  resource: resourceSchema,
  extensions: object({ "payment-identifier": object({ info: object({ id: { ...text(128), pattern: "^[A-Za-z0-9_-]{16,128}$" } }) }) }, []),
}, ["x402Version", "accepted", "payload"]));
const validRequirements = ajv.compile(requirementsSchema);

// The injected client is the already-enrolled @x402/core HTTPFacilitatorClient
// used by the merchant. No signer, wallet, escrow, retry or second client here.
// The first adapter deliberately admits only exact EVM EIP-3009 v2 payments.
export function existingFacilitatorAdapter({ client, budgetUnit, network, asset, payTo, allowLoopback = false }) {
  if (typeof client?.verify !== "function" || typeof client?.settle !== "function" || typeof client?.createAuthHeaders !== "function" || typeof client?.url !== "string") throw new Error("enrolled HTTPFacilitatorClient required");
  if (!budgetUnit || !/^eip155:[1-9][0-9]*$/.test(network) || !new RegExp(address.pattern).test(asset) || !new RegExp(address.pattern).test(payTo)) throw new Error("invalid facilitator admission");
  return Object.freeze({
    kind: "existing-facilitator", evidence: "facilitator_response",
    requirements(route) {
      const required = route.paymentRequirements;
      if (!validRequirements(required) || route.price.unit !== budgetUnit || required.amount !== String(route.price.amount) ||
        required.network !== network || required.asset.toLowerCase() !== asset.toLowerCase() || required.payTo.toLowerCase() !== payTo.toLowerCase()) {
        fail("payment_configuration", 503);
      }
      return structuredClone(required);
    },
    prepare(header, route) {
      const requirements = this.requirements(route);
      if (!header) fail("payment_required", 402);
      if (header.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) fail("invalid_payment");
      let payload;
      try { payload = boundedJson(Buffer.from(header, "base64").toString("utf8"), 12288); } catch { fail("invalid_payment"); }
      if (!validPayload(payload) || canonical(payload.accepted) !== canonical(requirements)) fail("invalid_payment");
      const auth = payload.payload.authorization;
      if (auth.to.toLowerCase() !== payTo.toLowerCase() || auth.value !== requirements.amount) fail("invalid_payment");
      const identity = paymentAuthorizationIdentity({ network, asset, authorization: auth });
      return { identity, payload, requirements };
    },
    async verify(prepared, { signal }) {
      signal.throwIfAborted();
      const result = await invokeFacilitator(client, "verify", prepared, signal, { allowLoopback });
      if (result?.isValid !== true) fail("payment_declined", 402);
    },
    async settle(prepared, { signal }) {
      signal.throwIfAborted();
      // The gateway has durably marked possible spend before entering here.
      const result = await invokeFacilitator(client, "settle", prepared, signal, { allowLoopback });
      if (result?.success !== true || typeof result.transaction !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result.transaction) || result.network !== network) fail("settlement_unknown", 502);
      return { state: "settled", adapter: "existing-facilitator", evidence: "facilitator_response", reference: result.transaction, network };
    },
  });
}

export function paymentAuthorizationIdentity({ network, asset, authorization }) {
  return digest([network, asset.toLowerCase(), authorization.from.toLowerCase(), authorization.nonce.toLowerCase()]);
}
