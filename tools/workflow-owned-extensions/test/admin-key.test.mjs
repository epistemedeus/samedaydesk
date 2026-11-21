import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { formatAdminKey } from "../runtime/provision-ghost.mjs";
import { ghostAdminToken, parseAdminKey } from "../src/ghost-runtime.mjs";

const id = "aabbccddeeff0011";
const secret = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const now = 1700000000;

function signatureFor(headerPayload, secretHex) {
  return createHmac("sha256", Buffer.from(secretHex, "hex")).update(headerPayload).digest("base64url");
}

test("raw admin secret is formatted once and signed with the full hex secret", () => {
  const formatted = formatAdminKey({ id, secret });
  assert.equal(formatted, `${id}:${secret}`);
  const minted = ghostAdminToken(formatted, { now, ttlSec: 300 });
  assert.equal(minted.ok, true);
  assert.equal(minted.keyId, id);
  const [header, payload, sig] = minted.token.split(".");
  assert.equal(sig, signatureFor(`${header}.${payload}`, secret));
  assert.equal(parseAdminKey(formatted).secret, secret);
});

test("mapper-prefixed admin secret is not double-prefixed before signing", () => {
  const formatted = formatAdminKey({ id, secret: `${id}:${secret}` });
  assert.equal(formatted, `${id}:${secret}`);
  assert.equal(formatted.split(":").length, 2);
  const raw = ghostAdminToken(`${id}:${secret}`, { now, ttlSec: 300 });
  const prefixed = ghostAdminToken(formatted, { now, ttlSec: 300 });
  assert.equal(raw.ok, true);
  assert.equal(prefixed.ok, true);
  assert.equal(prefixed.token, raw.token);
  const [header, payload, sig] = prefixed.token.split(".");
  assert.equal(sig, signatureFor(`${header}.${payload}`, secret));
});

test("double-prefixed and invalid secrets are refused instead of truncated", () => {
  const doubled = `${id}:${id}:${secret}`;
  assert.equal(formatAdminKey({ id, secret: doubled }), doubled);
  const minted = ghostAdminToken(doubled, { now, ttlSec: 300 });
  assert.equal(minted.ok, false);
  assert.equal(minted.token, undefined);
  assert.match(minted.message, /not hex/);

  const parsed = parseAdminKey(doubled);
  assert.equal(parsed.ok, true);
  // Node's hex decoder would keep the leading key id and stop at the colon.
  const truncated = Buffer.from(parsed.secret, "hex");
  assert.equal(truncated.toString("hex"), id);
  assert.notEqual(truncated.toString("hex"), secret);

  const mixed = ghostAdminToken(`${id}:aaZZ`, { now, ttlSec: 300 });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.token, undefined);
  assert.equal(Buffer.from("aaZZ", "hex").toString("hex"), "aa");

  for (const bad of [`${id}:zzzz`, `${id}:abc`, `${id}:`, "", "not-a-key"]) {
    const result = ghostAdminToken(bad, { now, ttlSec: 300 });
    assert.equal(result.ok, false, bad);
    assert.equal(result.token, undefined, bad);
  }
});
