import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadLog, startIntercept } from "../lib/honesty.mjs";
import { isExtractUrl } from "../lib/inspect.mjs";
import { TOOL_DIR } from "./helpers.mjs";

describe("local HTTP intercept (not a live merchant GET)", () => {
  it("local intercept blocks GET /extract without paying", async () => {
    const intercept = await startIntercept();
    try {
      const res = await fetch(`${intercept.origin}/extract?url=https://example.com`, {
        headers: { Accept: "application/json" },
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.blocked, true);
      assert.equal(body.notAPayment, true);
      assert.equal(body.code, "honesty_forbidden_request");
      assert.ok(body.reasons.includes("extract-url"));
      const log = loadLog(intercept.logPath);
      assert.ok(log.some((entry) => entry.kind === "local-http" && entry.forbidden));
    } finally {
      await intercept.stop();
    }
  });

  it("PAYMENT-SIGNATURE on local intercept is blocked", async () => {
    const intercept = await startIntercept();
    try {
      const res = await fetch(`${intercept.origin}/commerce/seller-integrity-audit`, {
        headers: { "PAYMENT-SIGNATURE": "fixture-not-a-real-signature" },
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.ok(body.reasons.includes("payment-header") || body.reasons.includes("seller-integrity-url"));
    } finally {
      await intercept.stop();
    }
  });

  it("PATH curl stub refuses extract URLs", async () => {
    const intercept = await startIntercept();
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("curl", ["https://agents.samedaydesk.com/extract?url=https://example.com"], {
        encoding: "utf8",
        env: intercept.childEnv,
      });
      assert.notEqual(result.status, 0);
      const blob = `${result.stdout}\n${result.stderr}`;
      assert.match(blob, /honesty_forbidden_request|honesty_net_stub/);
    } finally {
      await intercept.stop();
    }
  });

  it("F18 contrast fixture is unpaid 402, not external acceptance", () => {
    const pin = JSON.parse(
      readFileSync(join(TOOL_DIR, "fixtures/contrast/f18-merchant-extract-402.json"), "utf8"),
    );
    assert.equal(pin.class, "fixture");
    assert.equal(pin.notLiveGet, true);
    assert.equal(pin.notExternalAcceptance, true);
    assert.equal(pin.body.error, "Payment required");
    assert.equal(pin.body.x402Version, 2);
    assert.equal(pin.body.accepts[0].amount, "5000");
    assert.ok(isExtractUrl(pin.body.resource.url));
    assert.equal(pin.source.sha, "5e9fd3fc5e13989ef2cd45cf08f01cfe60c296cb");
  });
});
