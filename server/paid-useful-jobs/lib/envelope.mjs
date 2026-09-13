/**
 * Local non-settling paid-offer envelope.
 *
 * SDS Express has no x402 ResourceServer. This envelope records the same
 * resource/bazaar fill rules against fixture payloads via onBeforeVerify /
 * onBeforeSettle. Live settlement is out of scope: settlePayment always
 * throws and never contacts a facilitator.
 */
import {
  canonicalResourceUrlFromOriginAndPath,
  registerIndexingPayloadContinuity,
} from "./continuity.mjs";
import { DECLARED_PATH_PREFIX, DECLARED_PUBLIC_ORIGIN } from "./pins.mjs";
import { refuse } from "./input-guard.mjs";

export function declaredRouteMetadata(jobId) {
  const path = `${DECLARED_PATH_PREFIX}/${jobId}`;
  const url = canonicalResourceUrlFromOriginAndPath(DECLARED_PUBLIC_ORIGIN, path);
  return {
    live: false,
    publishedToLiveCatalog: false,
    resource: {
      url,
      description: `Non-live fixture wrapper for useful-job ${jobId}. Not a live catalog offer.`,
      mimeType: "application/json",
      serviceName: "SameDayDesk",
      tags: ["fixture", "useful-jobs", "not-live"],
    },
    extensions: {
      bazaar: {
        info: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
          },
        },
        schema: { type: "object" },
      },
    },
  };
}

export function createLocalNonSettlingResourceServer() {
  const beforeVerify = [];
  const beforeSettle = [];
  const server = {
    onBeforeVerify(hook) {
      beforeVerify.push(hook);
      return this;
    },
    onBeforeSettle(hook) {
      beforeSettle.push(hook);
      return this;
    },
    async verifyPayment(context) {
      for (const hook of beforeVerify) await hook(context);
      return {
        isValid: true,
        fixture: true,
        purchaseAuthority: false,
        liveSettleAllowed: false,
      };
    },
    async settlePayment() {
      throw refuse(
        "live-settle-out-of-scope",
        "Live settlement is out of scope for paid useful-job wrappers; fixture payments cannot call live settle",
        { liveSettleAllowed: false, purchaseAuthority: false },
      );
    },
    async runBeforeVerify(context) {
      for (const hook of beforeVerify) await hook(context);
    },
    async runBeforeSettle(context) {
      for (const hook of beforeSettle) await hook(context);
    },
  };
  return server;
}

export function attachContinuity(resourceServer, { jobId, publicOrigin = DECLARED_PUBLIC_ORIGIN } = {}) {
  const declared = jobId ? declaredRouteMetadata(jobId) : null;
  registerIndexingPayloadContinuity(resourceServer, {
    publicOrigin,
    resolveDeclaredResource: () => (declared ? declared.resource : null),
  });
  return resourceServer;
}

export async function applyEnvelopeContinuity({ jobId, paymentPayload, requirements }) {
  const server = attachContinuity(createLocalNonSettlingResourceServer(), { jobId });
  const declared = declaredRouteMetadata(jobId);
  const context = {
    paymentPayload,
    requirements: requirements || paymentPayload?.accepted || paymentPayload?.requirements,
    declaredExtensions: declared.extensions,
    transportContext: {
      request: {
        adapter: {
          getPath: () => `${DECLARED_PATH_PREFIX}/${jobId}`,
          getUrl: () => `https://evil.example${DECLARED_PATH_PREFIX}/${jobId}`,
        },
      },
    },
  };
  await server.runBeforeVerify(context);
  await server.runBeforeSettle(context);
  return { server, context, declared };
}
