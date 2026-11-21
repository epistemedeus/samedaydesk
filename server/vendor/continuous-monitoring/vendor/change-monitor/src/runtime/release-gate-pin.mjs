// Checked against the unpacked public archive when the consumer loads.
// This string is not an import of packages/release-gate.

export const RELEASE_GATE_PIN = Object.freeze({
  packageName: "release-gate",
  version: "0.1.4",
  archive: "release-gate-0.1.4.tgz",
  sha256: "f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef",
  bytes: 16254,
  url: "https://neomorphic.io/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz",
  publicPath: "/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz",
  receiptSchema: "release-gate.receipt.v1",
});

export const RECEIPT_SCHEMA = RELEASE_GATE_PIN.receiptSchema;
