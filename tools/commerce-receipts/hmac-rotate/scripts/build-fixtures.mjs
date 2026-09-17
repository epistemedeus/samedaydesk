#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, deriveFixtureKey, fingerprint, loadJson, signBody, unpaidBodyPath } from "../lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const validDir = join(root, "fixtures/valid");
const invalidDir = join(root, "fixtures/invalid");

const NOW = "2026-09-17T12:00:00.000Z";
const AFTER = "2026-09-17T13:00:00.000Z";
const BEFORE = "2026-09-17T00:00:00.000Z";
const FUTURE = "2026-09-18T00:00:00.000Z";
const KID_A = "sds-hmac-2026-09-a";
const KID_B = "sds-hmac-2026-09-b";
const LABEL_A = "fixture.a";
const LABEL_B = "fixture.b";

function write(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function key(kid, label, status, notBefore, notAfter = null) {
  return { kid, label, status, notBefore, notAfter };
}

function receipt(body, kid, label) {
  const keyBytes = deriveFixtureKey(label);
  return {
    receiptId: body.receiptId,
    kid,
    mac: signBody(keyBytes, kid, body),
    body,
  };
}

const body = loadJson(unpaidBodyPath());
const signedA = receipt(body, KID_A, LABEL_A);

write(join(validDir, "sign-current.json"), {
  schemaVersion: SCHEMA,
  intent: "sign",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [
    {
      receiptId: body.receiptId,
      kid: KID_A,
      body,
    },
  ],
});

write(join(validDir, "verify-current.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [signedA],
});

write(join(validDir, "rotate-overlap.json"), {
  schemaVersion: SCHEMA,
  intent: "rotate",
  now: NOW,
  overlapMs: 3600000,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  rotateTo: { kid: KID_B, label: LABEL_B },
  receipts: [signedA],
});

write(join(validDir, "dual-verify-overlap.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: {
    keys: [
      key(KID_A, LABEL_A, "previous", BEFORE, AFTER),
      key(KID_B, LABEL_B, "current", NOW, null),
    ],
  },
  receipts: [signedA],
});

write(join(invalidDir, "retired-key-after-overlap.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: AFTER,
  keyring: {
    keys: [
      key(KID_A, LABEL_A, "retired", BEFORE, AFTER),
      key(KID_B, LABEL_B, "current", NOW, null),
    ],
  },
  receipts: [signedA],
});

const forged = {
  ...signedA,
  mac: signedA.mac.slice(0, -1) + (signedA.mac.endsWith("a") ? "b" : "a"),
};
write(join(invalidDir, "forged-mac.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [forged],
});

write(join(invalidDir, "future-key.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", FUTURE, null)] },
  receipts: [signedA],
});

write(join(invalidDir, "key-reuse.json"), {
  schemaVersion: SCHEMA,
  intent: "rotate",
  now: NOW,
  overlapMs: 3600000,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  rotateTo: { kid: KID_B, label: LABEL_A },
  receipts: [signedA],
});

write(join(invalidDir, "overlap-missing.json"), {
  schemaVersion: SCHEMA,
  intent: "rotate",
  now: NOW,
  overlapMs: 0,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  rotateTo: { kid: KID_B, label: LABEL_B },
  receipts: [signedA],
});

write(join(invalidDir, "secret-in-receipt.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [
    {
      ...signedA,
      body: { ...body, hmacSecret: "fixture-not-a-real-secret" },
    },
  ],
});

write(join(invalidDir, "money-movement.json"), {
  schemaVersion: SCHEMA,
  intent: "checkout",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [signedA],
});

write(join(invalidDir, "invented-field.json"), {
  schemaVersion: SCHEMA,
  intent: "verify",
  now: NOW,
  keyring: { keys: [key(KID_A, LABEL_A, "current", BEFORE, null)] },
  receipts: [
    {
      ...signedA,
      body: { ...body, loyaltyPoints: 99 },
    },
  ],
});

write(join(invalidDir, "previous-cannot-sign.json"), {
  schemaVersion: SCHEMA,
  intent: "sign",
  now: NOW,
  keyring: {
    keys: [
      key(KID_A, LABEL_A, "previous", BEFORE, AFTER),
      key(KID_B, LABEL_B, "current", NOW, null),
    ],
  },
  receipts: [
    {
      receiptId: body.receiptId,
      kid: KID_A,
      body,
    },
  ],
});

write(join(invalidDir, "manifest.json"), {
  schemaVersion: "samedaydesk.commerce-receipts.hmac-rotate.invalid-manifest.v1",
  cases: [
    { file: "retired-key-after-overlap.json", code: "retired_key_after_overlap" },
    { file: "forged-mac.json", code: "forged_mac" },
    { file: "future-key.json", code: "future_key" },
    { file: "key-reuse.json", code: "key_reuse" },
    { file: "overlap-missing.json", code: "overlap_required" },
    { file: "secret-in-receipt.json", code: "secret_in_pack" },
    { file: "money-movement.json", code: "money_movement_refused" },
    { file: "invented-field.json", code: "invented_receipt_field" },
    { file: "previous-cannot-sign.json", code: "previous_key_cannot_sign" },
  ],
});

write(join(root, "fixtures/catalog.json"), {
  id: "sds-hmac-rotate-unpaid-402",
  schemaVersion: SCHEMA,
  origin: "https://agents.samedaydesk.com",
  resource: body.resource,
  overlapMs: 3600000,
  kids: [KID_A, KID_B],
  labels: [LABEL_A, LABEL_B],
  fingerprints: {
    a: fingerprint(deriveFixtureKey(LABEL_A)),
    b: fingerprint(deriveFixtureKey(LABEL_B)),
  },
  unpaid: true,
  paid: false,
});

process.stdout.write("wrote hmac-rotate fixtures\n");
