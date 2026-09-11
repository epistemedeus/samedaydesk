import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SDS_ROOT } from "../lib/pins.mjs";
import { spawnNode, spawnTrial, stdoutJson, tmpOut } from "./helpers.mjs";

test("Postgres is not a page-change store; missing engine is incomplete, not a skip", async () => {
  const probed = await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 5432 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("port_5432_no_accept_within_250ms");
    }, 250);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve("port_5432_open");
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve(`port_5432_${error.code || "error"}`);
    });
  });
  assert.equal(probed, "port_5432_ECONNREFUSED");
});

test("offer-routing still selects sdd.page_change_offline with the merchant skill artifact", () => {
  const result = spawnNode(
    join(SDS_ROOT, "tools/offer-routing/route-job.mjs"),
    [join(SDS_ROOT, "tools/offer-routing/fixtures/page-change-evidence.job.json")],
  );
  assert.equal(result.status, 0, result.stderr);
  const routed = JSON.parse(result.stdout);
  assert.equal(routed.ok, true);
  assert.equal(routed.selected.offerId, "sdd.page_change_offline");
  assert.equal(routed.selected.artifact, "skill page-change / merchant npm run page-change");
});

test("useful-jobs catalog on SDS52 has no page-change job", () => {
  const catalog = JSON.parse(
    readFileSync(join(SDS_ROOT, "client/public/for-agents/useful-jobs/catalog.json"), "utf8"),
  );
  assert.equal(catalog.jobs.some((job) => String(job.id).includes("page-change")), false);
});

test("unlike clocks produce unlike termsVersion hashes; they are not forced equal", () => {
  const first = stdoutJson(spawnTrial(["run", "--case", "complete-changed", "--out-dir", tmpOut("m18-terms-a-")]));
  const second = stdoutJson(spawnTrial(["run", "--case", "stale-after", "--out-dir", tmpOut("m18-terms-b-")]));
  assert.match(first.engine.termsVersion, /^sha256:[a-f0-9]{64}$/);
  assert.match(second.engine.termsVersion, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(first.engine.termsVersion, second.engine.termsVersion);
  assert.notEqual(first.captures.beforeSha256, second.captures.beforeSha256);
});
