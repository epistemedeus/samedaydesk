declare module "../fixtures/merchant-pr54/indexing-payload-continuity.mjs" {
  export function isExactEvmV2IndexingContinuitySupported(
    paymentPayload: unknown,
    requirements: unknown,
  ): boolean;

  export function planIndexingPayloadContinuity(
    paymentPayload: unknown,
    declared?: unknown,
  ): {
    supported: boolean;
    patches: { resource?: unknown; extensions?: unknown };
    provenance: {
      resource: string;
      bazaar: string;
      untouchedAuthority: true;
      declinedPayment: false;
    };
  };

  export function applyIndexingContinuityPatches(
    paymentPayload: Record<string, unknown>,
    patches: { resource?: unknown; extensions?: unknown },
  ): Record<string, unknown>;
}
