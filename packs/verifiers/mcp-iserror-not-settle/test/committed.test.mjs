import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { verifyCommitted } from "../src/committed.mjs";
import { MCP_REL } from "../src/rules.mjs";
import { analyzeMcpSource } from "../src/source.mjs";
import { parseStdout, REPO_ROOT, runVerify } from "./helpers.mjs";

test("cold committed run pins real server/routes/mcp.js", async () => {
  const result = await verifyCommitted({ repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.mode, "committed");
  assert.equal(result.paid, false);
  assert.equal(result.liveTouched, false);
  assert.equal(result.publishAttempted, false);
  assert.equal(result.checkoutTouched, false);
  assert.equal(result.recorded.path, MCP_REL);

  const src = readFileSync(join(REPO_ROOT, MCP_REL), "utf8");
  const sha = createHash("sha256").update(src).digest("hex");
  assert.equal(result.recorded.sha256, sha);
  assert.ok(result.recorded.isErrorSiteCount >= 5, result.recorded.isErrorSiteCount);
  assert.ok(result.isErrorSites.every((site) => site.viaOkMsg === true));
  assert.equal(result.checks.derived_http_200_claim_rejected, true);
  assert.equal(result.naiveWouldSettle, true);
  assert.ok(result.seededClaimAgainstCommitted.rejected >= 1);
});

test("CLI default and --committed exit 0 against committed MCP source", () => {
  const def = runVerify([]);
  const { json } = parseStdout(def);
  assert.equal(def.status, 0, def.stderr || def.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.mode, "committed");
  assert.equal(json.recorded.path, MCP_REL);

  const committed = runVerify(["--committed"]);
  assert.equal(committed.status, 0, committed.stderr || committed.stdout);
  const committedJson = parseStdout(committed).json;
  assert.equal(committedJson.recorded.sha256, json.recorded.sha256);
});

test("committed analysis sees SDS okMsg + unpaid / missing-url isError text", () => {
  const src = readFileSync(join(REPO_ROOT, MCP_REL), "utf8");
  const analysis = analyzeMcpSource(src);
  assert.equal(analysis.okMsg, true);
  assert.equal(analysis.httpJson, true);
  assert.ok(analysis.fixpackLink.startsWith("https://buy.stripe.com/"));
  assert.equal(analysis.missingSnippets.length, 0, JSON.stringify(analysis.missingSnippets));
  assert.ok(analysis.sites.length >= 5);
});

test("CLI --committed --publish is refused", () => {
  const proc = runVerify(["--committed", "--publish"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.ok, false);
  assert.equal(json.code, "forbidden_flag");
});
