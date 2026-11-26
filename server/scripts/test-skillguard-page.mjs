import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../..", import.meta.url));
const page = "client/public/skillguard.html";
const served = "client/dist/skillguard.html";
const command = "client/public/skillguard-url.js";
const servedCommand = "client/dist/skillguard-url.js";
const commandSha = "a7ba8ff7b1f1a484dedc827a776886f8045d0115090ebf1cc2c73358d9241573";
const read = (file) => readFileSync(join(root, file));
const sandbox = { module: { exports: {} }, exports: {}, URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(read(command).toString("utf8"), sandbox, { filename: command });
const skillguard = sandbox.module.exports;

test("SkillGuard page and command are the same bytes on the source and served routes", () => {
  const html = read(page);
  const js = read(command);
  assert.deepEqual(read(served), html);
  assert.deepEqual(read(servedCommand), js);
  assert.equal(createHash("sha256").update(js).digest("hex"), commandSha);
  assert.equal(js.length, 7018);
});

test("the free command stays the quoted local CLI and the page shows only the two hosted purchases", () => {
  const html = read(page).toString("utf8");
  const example = skillguard.commandForInput("https://github.com/owner/repo");
  const empty = skillguard.commandForInput("  ");
  const rejected = skillguard.commandForInput("https://user:secret@github.com/owner/repo");
  assert.equal(example.ok, true);
  assert.equal(example.command, "npx github:epistemedeus/skillguard 'https://github.com/owner/repo'");
  assert.equal(empty.command, "npx github:epistemedeus/skillguard './my-skill'");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.command, "Rejected. No request was made.");
  assert.match(html, /npx github:epistemedeus\/skillguard https:\/\/github\.com\/owner\/repo/);
  assert.match(html, /href="\/api\/checkout\/hosted\/skillguard-deep-audit"/);
  assert.match(html, /href="\/api\/checkout\/hosted\/skillguard-watch"/);
  assert.match(html, /29 USD/);
  assert.match(html, /12 USD/);
  assert.equal(html.includes("buy.stripe.com"), false);
  assert.equal(html.includes("q49"), false);
  assert.equal(html.includes("agent_first_use_report"), false);
  assert.equal(html.includes("/checkout?offer="), false);
});

test("the first-use report stays off the catalog switch", () => {
  const offers = JSON.parse(read("release/offers.json").toString("utf8"));
  const report = offers.offers.find((row) => row.id === "agent_first_use_report");
  assert.equal(report.switchedOn, false);
  assert.equal(report.status, "unavailable");
  assert.equal(report.cents, 4900);
  const audit = offers.notInHarnessYet.find((row) => row.id === "legacy_skill_audit");
  const watch = offers.notInHarnessYet.find((row) => row.id === "legacy_skill_watch");
  assert.equal(audit.cents, 2900);
  assert.equal(watch.cents, 1200);
  assert.equal(watch.interval, "month");
});
