import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ENGINE_SHA } from "../lib/pin.mjs";
import { resolveEngine } from "../lib/resolve-engine.mjs";
import { fixture, parseStdout, runConsumer, tmpOut } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("pinned Co12 CLI is materialized and is the SHA this consumer tested", () => {
  const engine = resolveEngine();
  assert.equal(engine.sha, ENGINE_SHA);
  assert.equal(["worktree", "env"].includes(engine.source) || engine.source === "in-tree", true);
  assert.match(readFileSync(engine.cli, "utf8"), /route-diff/);
});

test("missing engine root is engine-failure, not a skipped pass", () => {
  const missing = mkdtempSync(join(tmpdir(), "w5-m08-missing-engine-"));
  const result = runConsumer(
    [
      "--before",
      fixture("supported", "routes-before.json"),
      "--after",
      fixture("supported", "routes-before.json"),
      "--out-dir",
      tmpOut(),
    ],
    { env: { ROUTE_TABLE_DIFF_ROOT: missing } },
  );
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.code, "engine_unavailable");
  assert.equal(body.analysis, "engine-failure");
});

test("this consumer does not vendor tools/route-table-diff", () => {
  const source =
    readFileSync(join(here, "../bin/route-consumer.mjs"), "utf8") +
    readFileSync(join(here, "../lib/run-consumer.mjs"), "utf8") +
    readFileSync(join(here, "../lib/resolve-engine.mjs"), "utf8");
  assert.equal(source.includes("function diffRouteTables"), false);
  assert.equal(source.includes("function loadCatalogDocument"), false);
  assert.equal(source.includes("writeRouteShells"), false);
});
