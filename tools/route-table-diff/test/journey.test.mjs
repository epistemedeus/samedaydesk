import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { JOURNEY_AFTER, JOURNEY_BEFORE } from "../lib/constants.mjs";
import { runRouteDiff } from "../lib/index.mjs";
import { parseStdout, runCli, tmpOut } from "./helpers.mjs";

test("journey: useful-jobs v2 is added and /terms canonical change is listed", async () => {
  const outDir = tmpOut();
  const result = parseStdout(
    runCli([
      "--before",
      JOURNEY_BEFORE,
      "--after",
      JOURNEY_AFTER,
      "--out-dir",
      outDir,
    ]),
  );
  assert.equal(result.ok, true);
  assert.equal(result.publishedRouteTable, false);
  assert.equal(result.sample, false);
  assert.equal(result.evidenceClass.before, "caller");
  assert.equal(result.evidenceClass.after, "caller");
  assert.ok(result.added.includes("/for-agents/useful-jobs/v2"));
  const terms = result.changed.find((item) => item.path === "/terms");
  assert.ok(terms, "canonical change on /terms must be listed as changed");
  assert.deepEqual(terms.fields, ["canonical"]);
  const privacy = result.changed.find((item) => item.path === "/privacy");
  assert.ok(privacy, "robots change on /privacy must be listed as changed");
  assert.deepEqual(privacy.fields, ["robots"]);

  const json = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  const md = readFileSync(join(outDir, "route-diff.md"), "utf8");
  assert.equal(json.schema, "samedaydesk.route-diff.v1");
  assert.equal(json.counts.added, 1);
  assert.equal(json.added[0].path, "/for-agents/useful-jobs/v2");
  assert.equal(json.added[0].canonical, "https://samedaydesk.com/for-agents/useful-jobs/v2");
  const termsJson = json.changed.find((item) => item.path === "/terms");
  assert.equal(termsJson.before.canonical, "https://samedaydesk.com/terms");
  assert.equal(termsJson.after.canonical, "https://samedaydesk.com/legal/terms");
  assert.match(md, /\/for-agents\/useful-jobs\/v2/);
  assert.match(md, /\/terms/);
  assert.match(md, /canonical:/);
  assert.match(md, /Published route table: \*\*no\*\*/);
  assert.equal(json.paid, false);
  assert.equal(json.settled, false);
  assert.equal(json.nonsettling, true);
  assert.match(json.tableDigest.before, /^sha256:[a-f0-9]{64}$/);
  assert.match(json.tableDigest.after, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(json.tableDigest.before, json.tableDigest.after);
  assert.equal(json.breaking, false);
  assert.equal(json.outcome, "changed");
  assert.equal(result.breaking, false);
  assert.equal(result.outcome, "changed");
});

test("library API matches the CLI journey without writing shells", async () => {
  const diff = await runRouteDiff({ before: JOURNEY_BEFORE, after: JOURNEY_AFTER });
  assert.equal(diff.ok, true);
  assert.equal(diff.added.some((route) => route.path === "/for-agents/useful-jobs/v2"), true);
  assert.equal(diff.changed.some((item) => item.path === "/terms" && item.fields.includes("canonical")), true);
  assert.equal(diff.outputs, undefined);
});

test("title-only edits are not canonical/robots changes", async () => {
  const before = {
    schema: "samedaydesk.route-table.v1",
    routes: [
      {
        path: "/for-agents/useful-jobs",
        title: "Offline useful jobs for agent callers | SameDayDesk",
        canonical: "https://samedaydesk.com/for-agents/useful-jobs",
      },
    ],
  };
  const after = {
    schema: "samedaydesk.route-table.v1",
    routes: [
      {
        path: "/for-agents/useful-jobs",
        title: "Offline useful jobs (retitled) | SameDayDesk",
        canonical: "https://samedaydesk.com/for-agents/useful-jobs",
      },
    ],
  };
  const diff = await runRouteDiff({
    before: "memory://before",
    after: "memory://after",
    adapters: {
      readFileJson: (locator) => (locator.includes("before") ? before : after),
    },
  });
  assert.equal(diff.counts.changed, 0);
  assert.equal(diff.counts.titleOnly, 1);
  assert.equal(diff.titleOnly[0].path, "/for-agents/useful-jobs");
  assert.equal(diff.breaking, false);
  assert.equal(diff.outcome, "title-only");
});
