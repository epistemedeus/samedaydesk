import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { selectContribution, collectEvents } from "../lib/events.mjs";
import { reportError } from "../lib/integrate.mjs";
import { refuse } from "../lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/distribute.mjs");

test("CLI events prints JSON with unlike snapshot flags", () => {
  const r = spawnSync(process.execPath, [cli, "events"], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.unlike.listingBodiesEqual, false);
});

test("CLI submit --live exits 2 with valid refusal JSON", () => {
  const r = spawnSync(process.execPath, [cli, "submit", "--live"], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 2, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.code, "live-publish-not-authorized");
});

test("CLI unknown command exits 2", () => {
  const r = spawnSync(process.execPath, [cli, "blast-partners"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});

test("select grexal kind is closed outreach", async () => {
  const events = await collectEvents();
  await assert.rejects(
    () => selectContribution(events, { kind: "grexal-marketplace-scan" }),
    (err) => err.code === "closed-generic-outreach",
  );
});

test("engine crash stays distinct from valid refusal", () => {
  const crash = reportError(new Error("spawn ENOENT"));
  assert.equal(crash.refused, false);
  assert.equal(crash.transport.ok, false);
  assert.equal(crash.analysis.kind, "not-run");
  const refused = reportError(refuse("closed-generic-outreach", "no"));
  assert.equal(refused.refused, true);
  assert.equal(refused.transport.ok, true);
  assert.equal(refused.analysis.kind, "valid-refusal");
});
