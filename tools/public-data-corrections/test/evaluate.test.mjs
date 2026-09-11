import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { evaluate } from "../lib/evaluate.mjs";
import { isPublicConsumerUrl, localPublicFile } from "../lib/citation.mjs";
import { formatDigest, sha256File } from "../lib/digest.mjs";
import { CODES, REPO_ROOT, SCHEMA } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");

function loadOk() {
  return JSON.parse(readFileSync(join(pkg, "fixtures/ok.json"), "utf8"));
}

describe("evaluate public-data corrections", () => {
  it("ok packet is a verified collection against the committed public catalog", () => {
    const catalog = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
    const digest = formatDigest(sha256File(catalog));
    const packet = loadOk();
    assert.equal(packet.document.digest, digest);
    assert.equal(packet.correction.citation.digest, digest);
    assert.equal(packet.schema, SCHEMA);

    const result = evaluate(packet);
    assert.equal(result.ok, true);
    assert.equal(result.rights, "cleared");
    assert.equal(result.publishAuthorized, false);
    assert.equal(result.privateData, false);
    assert.equal(result.correction.to, false);
    assert.equal(result.rightsClearance.payingRightsHolder, false);
  });

  it("maps the catalog URL onto the in-repo public file", () => {
    const url = "https://samedaydesk.com/for-agents/useful-jobs/catalog.json";
    assert.equal(isPublicConsumerUrl(url), true);
    assert.equal(
      localPublicFile(url),
      join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json"),
    );
    assert.equal(isPublicConsumerUrl("https://agents.samedaydesk.com/extract"), false);
    assert.equal(isPublicConsumerUrl("https://samedaydesk.com/checkout"), false);
    assert.equal(isPublicConsumerUrl("http://samedaydesk.com/for-agents/useful-jobs/catalog.json"), false);
  });

  it("rejects a digest that does not match the public file", () => {
    const packet = loadOk();
    packet.document.digest = `sha256:${"0".repeat(64)}`;
    packet.correction.citation.digest = packet.document.digest;
    const result = evaluate(packet);
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.DIGEST_MISMATCH);
    assert.equal(result.publishAuthorized, false);
  });

  it("rejects a citation that is not a public consumer URL", () => {
    const packet = loadOk();
    packet.correction.citation.url = "https://billing.internal.example/customers/42";
    const result = evaluate(packet);
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.CITATION_NOT_PUBLIC);
    assert.equal(result.publishAuthorized, false);
  });

  it("rejects a missing correction citation", () => {
    const packet = loadOk();
    delete packet.correction.citation;
    const result = evaluate(packet);
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.MISSING_CITATION);
    assert.equal(result.publishAuthorized, false);
  });

  it("rejects remote scrape attempts", () => {
    const packet = loadOk();
    packet.scrape = true;
    const result = evaluate(packet);
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.REMOTE_SCRAPE_FORBIDDEN);
  });

  it("never authorizes publish on a cleared collection", () => {
    const result = evaluate(loadOk());
    assert.equal(result.ok, true);
    assert.equal(result.publishAuthorized, false);
  });

  it("does not call fetch", () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("fetch-must-not-run");
    };
    try {
      const result = evaluate(loadOk());
      assert.equal(result.ok, true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
