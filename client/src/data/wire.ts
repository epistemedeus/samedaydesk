// The wire: one real exchange on the paid gateway, from the settlement record
// published at /research/agent402-seller-integrity-validation-2026-08-29.json.
// Payer shortened. The 402 terms are the recorded amount, asset, network and
// recipient in the x402 shape the gateway serves.
export const WIRE_SOURCE = "/research/agent402-seller-integrity-validation-2026-08-29.json";
export const WIRE_DATE = "2026-08-29";
export const WIRE = [
  {
    id: "request",
    who: "Agent",
    label: "Request",
    lines: ["GET /commerce/seller-integrity-audit", "Host: agents.samedaydesk.com", "Accept: application/json"],
  },
  {
    id: "402",
    who: "Gateway",
    label: "402 Payment Required",
    lines: [
      '{ "x402Version": 2,',
      '  "accepts": [{ "scheme": "exact",',
      '    "network": "eip155:8453",',
      '    "asset": "USDC", "amount": "10000",',
      '    "payTo": "0x8904…3Cee" }] }',
    ],
  },
  {
    id: "pay",
    who: "Agent",
    label: "Payment",
    lines: ["GET /commerce/seller-integrity-audit", "PAYMENT-SIGNATURE: signed by 0x902d…8256", "0.01 USDC on Base"],
  },
  {
    id: "200",
    who: "Gateway",
    label: "200 OK, with receipt",
    lines: ['{ "decision": "repair_required",', '  "settlement": "0x2916…6ef7",', '  "network": "eip155:8453" }'],
  },
] as const;
