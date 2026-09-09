import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENTS_LLMS_URL,
  APEX_FOR_AGENTS_URL,
  loadCaptureMeta,
  resolveForAgentsColdRead,
  sha256File,
} from "./for-agents-cold-read.mjs";

test("capture meta documents apex TLS failure and free alternates", () => {
  const meta = loadCaptureMeta();
  assert.equal(meta.frictionId, "hostinger-tls-for-agents-cold-read");
  assert.equal(meta.apexForAgentsUrl, APEX_FOR_AGENTS_URL);
  assert.equal(meta.apexObserved.ok, false);
  assert.equal(meta.paidStep, null);
  assert.equal(meta.freeAlternates.length, 2);
  for (const alt of meta.freeAlternates) {
    assert.equal(sha256File(alt.bodyFile), alt.sha256);
  }
});

test("apex success path uses for-agents URL and never pays", async () => {
  const result = await resolveForAgentsColdRead({
    fetchApex: async () => ({ ok: true, status: 200, errorClass: null }),
  });
  assert.equal(result.outcome, "apex_ok");
  assert.equal(result.surface, APEX_FOR_AGENTS_URL);
  assert.equal(result.paid, false);
});

test("TLS/connect failure falls back to agents-host fixtures without paying", async () => {
  const result = await resolveForAgentsColdRead({
    fetchApex: async () => ({
      ok: false,
      status: null,
      errorClass: "tls_or_connect_failure",
    }),
  });
  assert.equal(result.outcome, "fallback_agents_host_or_fixture");
  assert.equal(result.surface, AGENTS_LLMS_URL);
  assert.equal(result.paid, false);
  assert.equal(result.alternatesUsed.length, 2);
  assert.ok(result.alternatesUsed.every((a) => a.matchesCapture));
});

test("preferFixture skips apex and still resolves free alternate", async () => {
  const result = await resolveForAgentsColdRead({ preferFixture: true });
  assert.equal(result.outcome, "fallback_agents_host_or_fixture");
  assert.equal(result.paid, false);
  assert.equal(result.apex.ok, false);
});
