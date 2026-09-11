import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliMain } from "../src/index.mjs";
import { ingestAll } from "../src/ingest.mjs";
import { buildReport } from "../src/report.mjs";
import { renderHtml } from "../src/html.mjs";
import { FIX, TEST_NOW, PACK } from "./helpers.mjs";

function collect() {
  let out = "";
  let err = "";
  return {
    stdout: { write(s) { out += s; return true; } },
    stderr: { write(s) { err += s; return true; } },
    get stdoutText() { return out; },
    get stderrText() { return err; },
  };
}

test("CLI adapters / policy / help", async () => {
  const a = collect();
  assert.equal(await cliMain(["adapters"], a), 0);
  const parsed = JSON.parse(a.stdoutText);
  assert.ok(parsed.adapters.some((x) => x.name === "frantic"));
  const p = collect();
  assert.equal(await cliMain(["policy"], p), 0);
  assert.equal(JSON.parse(p.stdoutText).effortHours, "0");
  const h = collect();
  assert.equal(await cliMain(["help"], h), 0);
  assert.match(h.stdoutText, /bounty-intelligence/);
});

test("CLI report fixture mode emits JSON with selected frantic job", async () => {
  const c = collect();
  const dir = mkdtempSync(join(tmpdir(), "s277-"));
  const out = join(dir, "report.json");
  const htmlOut = join(dir, "compare.html");
  const code = await cliMain(
    ["report", "--fixture-dir", FIX, "--now", TEST_NOW, "--out", out, "--html", htmlOut, "--effort-hours", "0"],
    c,
  );
  assert.equal(code, 0);
  const report = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(report.schema, "s277.bounty-intelligence.report.v1");
  assert.equal(report.selected.match, true);
  assert.equal(report.selected.adapter, "frantic");
  const html = readFileSync(htmlOut, "utf8");
  assert.match(html, /Selected claimable task/);
  assert.match(html, /Bounty intelligence/);
  assert.doesNotMatch(html, /<nav/);
});

test("HTML renderer is a reusable page component without global nav", async () => {
  const ingest = await ingestAll({ mode: "fixture", fixtureDir: FIX, now: TEST_NOW });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: TEST_NOW });
  const html = renderHtml(report);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /id="bounty-intelligence-report"/);
  assert.match(html, /expected useful net return/i);
  if (!report.selected.match) {
    assert.match(html, /No genuinely claimable paid job/);
  } else {
    assert.match(html, /Prerequisites/);
  }
  mkdirSync(join(PACK, "html"), { recursive: true });
  writeFileSync(join(PACK, "html", "bounty-compare.html"), html);
});

test("CLI unknown command is non-zero", async () => {
  const c = collect();
  assert.equal(await cliMain(["nope"], c), 2);
});
