import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  enforcementContract,
  loadLog,
  observeMustNotRun,
  probeExtractFetch,
  probeExtractFetchUnhooked,
  startIntercept,
} from "../lib/honesty.mjs";
import { EXTRACT_EXAMPLE_URL } from "../lib/pins.mjs";
import { parseStdout, runCli, startDummyJsonServer, TOOL_DIR } from "./helpers.mjs";

describe("honest enforcement claims", () => {
  it("CLI enforcement contract never claims OS isolation", () => {
    const spawned = runCli(["enforcement"]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseStdout(spawned);
    assert.equal(body.osIsolation, false);
    assert.equal(body.kind, "js-hooks+path-stub+proxy-env");
    assert.equal(body.paymentAttemptDetection.promised, true);
    assert.equal(body.paymentAttemptDetection.liveMerchantGet, false);
    assert.equal(enforcementContract().osIsolation, false);
    assert.notEqual(body.schema, "samedaydesk.paid-useful-jobs.receipt.v1");
  });

  it("CLI probe-extract detects a local /extract payment-shaped attempt", async () => {
    const spawned = runCli(["probe-extract"]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseStdout(spawned);
    assert.equal(body.caught, true);
    assert.equal(body.escaped, false);
    assert.equal(body.paymentAttemptDetected, true);
    assert.equal(body.osIsolation, false);
    assert.equal(body.liveGet, false);
    assert.match(body.fetchUrl, /^http:\/\/127\.0\.0\.1:\d+\/extract/);
  });

  it("CLI probe-extract still detects the merchant extract URL shape without a live GET", async () => {
    const body = await probeExtractFetch({ url: EXTRACT_EXAMPLE_URL });
    assert.equal(body.caught, true);
    assert.equal(body.rewroteRemoteUrl, true);
    assert.equal(body.requestedUrl, EXTRACT_EXAMPLE_URL);
    assert.equal(body.liveGet, false);
    assert.equal(body.osIsolation, false);
    assert.match(body.fetchUrl, /^http:\/\/127\.0\.0\.1:\d+\//);
  });

  it("CLI probe with PAYMENT-SIGNATURE is a detected payment attempt", async () => {
    const body = await probeExtractFetch({
      script: join(TOOL_DIR, "fixtures/probes/payment-header-fetch.mjs"),
      url: "http://127.0.0.1/",
    });
    assert.equal(body.caught, true);
    assert.equal(body.paymentAttemptDetected, true);
    assert.equal(body.osIsolation, false);
    assert.equal(body.liveGet, false);
  });

  it("unhooked fetch to a local dummy /extract escapes and is not claimed as OS isolation", async () => {
    const dummy = await startDummyJsonServer();
    try {
      const url = `${dummy.origin}/extract?url=https://example.com`;
      const body = await probeExtractFetchUnhooked({ url });
      assert.equal(body.escaped, true, `${body.stdout}\n${body.stderr}\n${body.error}`);
      assert.equal(body.caught, false);
      assert.equal(body.osIsolation, false);
      assert.equal(body.hooksInstalled, false);
      assert.equal(body.outcomeClass, "js-hooks-not-os-isolation");
      assert.equal(body.liveGet, false);
    } finally {
      await dummy.stop();
    }
  });

  it("unhooked probe refuses a remote URL instead of live-GET", async () => {
    await assert.rejects(
      () => probeExtractFetchUnhooked({ url: EXTRACT_EXAMPLE_URL }),
      (err) => err.code === "unhooked_probe_requires_local_url",
    );
  });

  it("CLI observe-must-not-run is a text scan, not OS proof", () => {
    const echo = runCli(["observe-must-not-run"]);
    assert.equal(echo.status, 1, echo.stdout);
    const hit = parseStdout(echo);
    assert.equal(hit.osIsolation, false);
    assert.equal(hit.evidenceClass, "stdout-stderr-text-scan");
    assert.ok(hit.mustNotRunObserved.includes("payX402 paid retry"));
    assert.equal(hit.mustNotRunPreserved, false);

    const clean = runCli(["observe-must-not-run", "--text", "listing-repair-packet actionable"]);
    assert.equal(clean.status, 0, clean.stderr + clean.stdout);
    const cleanBody = parseStdout(clean);
    assert.equal(cleanBody.mustNotRunPreserved, true);
    assert.deepEqual(cleanBody.mustNotRunObserved, []);
    assert.equal(cleanBody.osIsolation, false);
  });

  it("copying mustNotRun is not treated as preservation", () => {
    const listed = ["payX402 paid retry"];
    const tautology = observeMustNotRun({
      text: JSON.stringify(listed),
      mustNotRun: listed,
    });
    assert.equal(tautology.mustNotRunPreserved, false);
    assert.deepEqual(tautology.mustNotRunObserved, listed);
  });

  it("sequential intercepts keep separate logs and do not mutate parent HONESTY_INTERCEPT_LOG", async () => {
    const previous = process.env.HONESTY_INTERCEPT_LOG;
    const first = await startIntercept();
    const second = await startIntercept();
    try {
      const a = await fetch(`${first.origin}/extract`);
      const b = await fetch(`${second.origin}/extract`);
      assert.equal(a.status, 403);
      assert.equal(b.status, 403);
      const logA = loadLog(first.logPath);
      const logB = loadLog(second.logPath);
      assert.ok(logA.some((entry) => entry.kind === "local-http" && entry.forbidden));
      assert.ok(logB.some((entry) => entry.kind === "local-http" && entry.forbidden));
      assert.equal(
        logA.some((entry) => entry.url && String(entry.url).includes(`:${second.port}/`)),
        false,
      );
      assert.equal(process.env.HONESTY_INTERCEPT_LOG, previous);
    } finally {
      await first.stop();
      await second.stop();
      assert.equal(process.env.HONESTY_INTERCEPT_LOG, previous);
    }
  });
});
