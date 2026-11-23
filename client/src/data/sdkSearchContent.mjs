// Site-owned introductions applied after the pinned Sourcey API snapshot is copied.
// Upstream signatures, examples, symbol anchors and navigation remain the snapshot's source.
export const SDK_SEARCH_CONTENT = Object.freeze({
  '/docs/x402-sdk/api/pkg-extensions-bazaar.html': Object.freeze({
    title: 'x402 Bazaar Discovery: Go SDK Reference | SameDayDesk',
    description: 'Go API reference for x402 Bazaar discovery. Describe HTTP resources and MCP tools, validate discovery data, and extract resource metadata for x402 v1 and v2.',
    heading: 'x402 Bazaar discovery in the Go SDK',
    proseReplacements: [['soft-drop semantics -', 'soft-drop semantics;']],
    introduction: 'Describe your HTTP endpoints or MCP tools so facilitators can discover and catalog them. This Go package declares discovery metadata, validates its structure and reads it from x402 v1 and v2 payment messages.',
  }),
  '/docs/x402-sdk/api/pkg-mechanisms-svm.html': Object.freeze({
    title: 'Solana x402 Payments: Go SDK SVM Reference | SameDayDesk',
    description: 'Go SDK reference for Solana x402 payments: encode transactions, parse token amounts, read network configuration, and use SVM payment payloads and signer interfaces.',
    heading: 'Solana payment helpers for x402 in Go',
    proseReplacements: [
      ['mutable -', 'mutable;'],
      ['before broadcast - so', 'before broadcast, so'],
      [' - alias for ', ': alias for '],
      ['underlying map -', 'underlying map;'],
      ['returns the mutex -', 'returns the mutex;'],
    ],
    introduction: 'Use these Go helpers to encode and decode Solana transactions, parse token amounts and read network configuration for x402. The reference covers SVM payment payloads, signer interfaces and USDC network constants.',
  }),
});
