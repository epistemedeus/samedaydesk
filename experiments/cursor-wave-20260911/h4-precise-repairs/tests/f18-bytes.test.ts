import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  F18_BYTES_BR_EXAMPLE,
  F18_BYTES_DECODED_PIN,
  F18_BYTES_GZIP_EXAMPLE,
  F18_BYTES_JSON_TEXT,
  assertCompressedLengthIsNotJsonPin,
  compareCompressedLengthToDecoded,
  pinDecodedJsonBytes,
} from "../src/f18-bytes.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const NON_TRIVIAL_JSON = JSON.stringify({
  id: "F18-bytes",
  route: "/extract",
  nested: { display: "$0.005", amountAtomic: "5000", repeats: ["a", "b", "c"] },
  finding: "gzip/br Content-Length is not the decoded JSON byte pin",
});

test("gzip Content-Length is not decoded JSON bytes for a non-trivial JSON object", () => {
  const compared = compareCompressedLengthToDecoded(NON_TRIVIAL_JSON, "gzip");
  assert.equal(compared.encoding, "gzip");
  assert.equal(compared.decodedBytes, Buffer.byteLength(NON_TRIVIAL_JSON, "utf8"));
  assert.notEqual(compared.contentLength, compared.decodedBytes);
  assert.equal(compared.match, false);
  assert.ok(compared.contentLength > 0);
});

test("br Content-Length is not decoded JSON bytes", () => {
  const compared = compareCompressedLengthToDecoded(NON_TRIVIAL_JSON, "br");
  assert.equal(compared.encoding, "br");
  assert.equal(compared.decodedBytes, Buffer.byteLength(NON_TRIVIAL_JSON, "utf8"));
  assert.notEqual(compared.contentLength, compared.decodedBytes);
  assert.equal(compared.match, false);
  assert.ok(compared.contentLength > 0);
});

test("treating compressed length as the JSON pin is rejected", () => {
  const gzip = compareCompressedLengthToDecoded(NON_TRIVIAL_JSON, "gzip");
  const verdict = assertCompressedLengthIsNotJsonPin({
    contentLength: gzip.contentLength,
    decodedBytes: gzip.decodedBytes,
    treatCompressedAsPin: true,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.rejected, true);
  assert.equal(verdict.code, "compressed-length-is-not-json-pin");
  assert.match(verdict.reason, /Content-Length/i);
  assert.match(verdict.reason, /not the decoded JSON/i);
});

test("decoded pin is utf8 Buffer.byteLength of JSON, not Content-Length", () => {
  const pin = pinDecodedJsonBytes(F18_BYTES_JSON_TEXT);
  assert.equal(pin.decodedBytes, Buffer.byteLength(F18_BYTES_JSON_TEXT, "utf8"));
  assert.equal(
    pin.sha256,
    createHash("sha256").update(F18_BYTES_JSON_TEXT, "utf8").digest("hex"),
  );
  assert.deepEqual(pin, F18_BYTES_DECODED_PIN);
  assert.notEqual(pin.decodedBytes, F18_BYTES_GZIP_EXAMPLE.contentLength);
  assert.notEqual(pin.decodedBytes, F18_BYTES_BR_EXAMPLE.contentLength);
  assert.equal(F18_BYTES_GZIP_EXAMPLE.match, false);
  assert.equal(F18_BYTES_BR_EXAMPLE.match, false);
});

test("corpus fixture F18-bytes records local gzip/br vs decoded-byte facts", () => {
  const fixture = JSON.parse(
    readFileSync(join(packRoot, "fixtures/corpus/F18-bytes.json"), "utf8"),
  );
  assert.equal(fixture.id, "F18-bytes");
  assert.equal(fixture.disposition, "reproduced");
  assert.equal(fixture.kind, "reproduction");
  assert.equal(fixture.evaluator, "f18-bytes");
  assert.equal(fixture.saleState, "not_a_sale");
  assert.equal(fixture.provenance, "fixture");
  assert.equal(fixture.authorized, false);
  assert.equal(fixture.facts.decodedBytes, F18_BYTES_DECODED_PIN.decodedBytes);
  assert.equal(fixture.facts.gzip.contentLength, F18_BYTES_GZIP_EXAMPLE.contentLength);
  assert.equal(fixture.facts.br.contentLength, F18_BYTES_BR_EXAMPLE.contentLength);
  assert.equal(fixture.facts.gzip.match, false);
  assert.equal(fixture.facts.br.match, false);
});
