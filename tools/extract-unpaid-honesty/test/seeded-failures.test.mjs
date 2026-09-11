import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertHashTermsVersion,
  hashTermsVersion,
  probeExtractFetch,
  refusePaidRetry,
  refusePaidRetryFile,
} from "../lib/honesty.mjs";
import { HashTermsRefuse } from "../lib/hash-terms.mjs";
import { parseStdout, runCli, TOOL_DIR } from "./helpers.mjs";

describe("seeded failures", () => {
  it("stub that fetches agents.samedaydesk.com/extract is caught", async () => {
    const spawned = runCli(["probe-extract"]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseStdout(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.caught, true);
    assert.equal(body.escaped, false);
    assert.equal(body.code, "honesty_forbidden_request");
    assert.equal(body.purchaseAuthority, false);
    assert.ok(body.log.some((entry) => entry.forbidden));
  });

  it("library probeExtractFetch catches the stub", async () => {
    const body = await probeExtractFetch();
    assert.equal(body.caught, true);
    assert.equal(body.escaped, false);
  });

  it("wrapping useful-jobs with a paid retry is refused", () => {
    const spawned = runCli(["refuse-paid-retry"]);
    assert.equal(spawned.status, 2, spawned.stdout);
    const body = parseStdout(spawned);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "paid_retry_wrap_refused");
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.sold, false);
    assert.equal(body.settled, false);
    assert.ok(body.hits.includes("paid-retry"));
    assert.ok(body.hits.includes("payment-header"));
    assert.ok(body.hits.includes("extract-url"));
  });

  it("library refusePaidRetry refuses the fixture wrap", () => {
    const wrapPath = join(TOOL_DIR, "fixtures/probes/paid-retry-wrap.json");
    const body = refusePaidRetryFile(wrapPath);
    assert.equal(body.refused, true);
    assert.equal(body.code, "paid_retry_wrap_refused");
    const inline = refusePaidRetry({
      wrapUsefulJobs: true,
      paidRetry: true,
      target: "https://agents.samedaydesk.com/extract/batch",
    });
    assert.equal(inline.refused, true);
  });

  it("integer F01 termsVersion is rejected; I01 sha256: hash is accepted", () => {
    assert.throws(() => hashTermsVersion(1), HashTermsRefuse);
    assert.throws(() => assertHashTermsVersion("3"), (err) => err.code === "integer_terms_version_rejected");
    const hashed = hashTermsVersion({ purchaseAuthority: false, sold: false });
    assert.match(hashed, /^sha256:[0-9a-f]{64}$/);
    assert.equal(assertHashTermsVersion(hashed), hashed);
  });
});
