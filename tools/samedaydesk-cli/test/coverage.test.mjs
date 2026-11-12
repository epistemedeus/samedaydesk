import { test } from "node:test";
import assert from "node:assert/strict";
import { COVERAGE, coverageDocument } from "../src/coverage.mjs";
import { COMMANDS } from "../src/manifest.mjs";
import { run } from "./helpers.mjs";

test("coverage: every cli entry names real commands or batch ops; every handoff has a reference; counts add up", async () => {
  const doc = coverageDocument("test");
  assert.equal(doc.counts.cli + doc.counts.handoff + doc.counts.unsupported + doc.counts.gap, doc.normalUserActions);
  const ids = new Set(COVERAGE.map(entry => entry.id));
  assert.equal(ids.size, COVERAGE.length, "unique ids");
  for (const id of ["gateway.execute_free", "gateway.quote_tenant", "gateway.receipt", "apex.ai_readiness", "market.discover"]) assert.equal(COVERAGE.find(entry => entry.id === id).classification, "cli", id);
  assert.equal(COVERAGE.find(entry => entry.id === "gateway.execute_paid").classification, "unsupported");
  const covered = new Set(COVERAGE.flatMap(entry => entry.commands));
  for (const command of COMMANDS.filter(item => item.effect !== "none" && item.id !== "batch.run")) assert.ok(covered.has(command.id), `${command.id} maps to an advertised action`);
  const { exit, out, calls } = await run(["coverage"]);
  assert.equal(exit, 0);
  assert.equal(calls.length, 0);
  assert.equal(out[0].result.schema, "samedaydesk.cli.coverage.v1");
});

test("tools: ai-readiness and llms-txt are GET reads on the apex routes with typed refusal", async () => {
  const { json } = await import("./helpers.mjs");
  const ai = await run(["tools", "ai-readiness", "--url", "https://example.com"], { answers: [json(200, { url: "https://example.com/", score: 40, grade: "D", checks: [] })] });
  assert.equal(ai.exit, 0);
  assert.equal(ai.calls[0].url, "https://samedaydesk.com/api/tools/ai-readiness?url=https%3A%2F%2Fexample.com");
  const llms = await run(["tools", "llms-txt", "--url", "example.com"], { answers: [json(200, { origin: "https://example.com", siteName: "E", count: 1, llmsTxt: "# E" })] });
  assert.equal(llms.out[0].result.llmsTxt, "# E");
  const refused = await run(["tools", "ai-readiness", "--url", "http://10.0.0.1"], { answers: [json(400, { error: "That address isn't reachable for a public check" })] });
  assert.equal(refused.out[0].error.code, "http_refused");
  assert.equal(refused.calls.length, 1, "a 400 is not retried");
});
