import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFixtureSeed, publicBrowserProjection } from "../src/catalog.mjs";
import { createMachine } from "../src/machine.mjs";
import { PACK, PAGE } from "./helpers.mjs";

test("lab page exists inside the write boundary and stays noindex", () => {
  assert.equal(existsSync(PAGE), true);
  const source = readFileSync(PAGE, "utf8");
  assert.match(source, /noindex/);
  assert.match(source, /walletless/i);
  assert.match(source, /EARNED_WORK/);
  assert.match(source, /payout key/i);
  assert.match(source, /owed/i);
  assert.match(source, /R3-09|settlement receipt/i);
  assert.doesNotMatch(source, /EARNED_WORK_OWNER_TOKEN\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(source, /wallet connect/i);
  assert.match(source, /packs\/contributor-desk/);
  assert.match(source, /data-contributor-desk/);
  assert.match(source, /publicBrowserProjection/);
  assert.match(source, /data-desk-catalog/);
  assert.doesNotMatch(source, /JSON\.stringify\(seed\)/);
  assert.doesNotMatch(source, /data-desk-seed/);
});

test("page does not claim settlement or owner accept", () => {
  const source = readFileSync(PAGE, "utf8");
  assert.doesNotMatch(source, /actual_completion/);
  assert.match(source, /not settled money/i);
  assert.match(source, /not a settlement receipt/i);
});

test("browser projection drops internal budget and still runs the fixture desk", () => {
  const seed = buildFixtureSeed();
  const projection = publicBrowserProjection(seed);
  const json = JSON.stringify(projection);
  assert.equal(json.includes('"budget"'), false);
  assert.equal(json.includes("1.00"), false);
  assert.equal(json.includes("obl_owed_delta"), false);
  assert.equal(json.includes("fixture://"), false);
  assert.equal(json.includes('"payoutAdapter"'), false);
  assert.equal(projection.tasks.length, seed.tasks.length);

  const machine = createMachine({
    seed: projection,
    now: () => projection.clock,
    randomId: () => "id_projection",
  });
  const claim = machine.claim({ taskId: "tsk_open_alpha", contributorPublicId: "ctr_walrus" });
  assert.equal(claim.task.lifecycle, "claimed");
  assert.equal(claim.reservation.contributorPublicId, "ctr_walrus");
  const appeal = machine.appeal({
    taskId: "tsk_rejected_gamma",
    contributorPublicId: "ctr_gamma",
    reason: "Bound digest was labelled against the wrong fixture note.",
  });
  assert.equal(appeal.appeal.status, "filed");
  const owed = machine.owedVersusPaid({ taskId: "tsk_owed_delta" });
  assert.equal(owed.owed, true);
  assert.equal(owed.paid, false);
  assert.equal(owed.settled, false);
  assert.equal(owed.transfer, null);
  assert.equal(JSON.stringify(machine.snapshot()).includes('"budget"'), false);
});

test("built contributor desk page does not embed internal budget", () => {
  const htmlPath = join(PACK, "../../dist/labs/contributor-desk/index.html");
  assert.equal(existsSync(htmlPath), true, "build dist/labs/contributor-desk/index.html before this test");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /data-desk-catalog/);
  assert.match(html, /tsk_open_alpha/);
  assert.doesNotMatch(html, /"budget"/);
  assert.doesNotMatch(html, /1\.00/);
  assert.doesNotMatch(html, /obl_owed_delta/);
  assert.doesNotMatch(html, /fixture:\/\/delta/);
  assert.doesNotMatch(html, /fixture:\/\/gamma/);
  assert.doesNotMatch(html, /"payoutAdapter"/);
  assert.doesNotMatch(html, /data-desk-seed/);
});
