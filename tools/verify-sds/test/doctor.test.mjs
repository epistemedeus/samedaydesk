import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runDoctor } from "../lib/doctor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

test("runDoctor passes on this clone and never dumps .env", () => {
  const env = runDoctor({ root, dryRun: false });
  assert.equal(env.ok, true, env.error?.message);
  assert.equal(env.command, "doctor");
  assert.deepEqual(env.result.jobs, ["useful-jobs", "packs", "mcp"]);
  assert.equal(env.boundary.paymentSent, false);
  const dumped = env.evidence.filter((item) => item.envDumped === true || item.dumped === true);
  assert.equal(dumped.length, 0);
  const blob = JSON.stringify(env);
  assert.doesNotMatch(blob, /sk_live|STRIPE_SECRET_KEY\s*[:=]\s*sk_/);
});

test("runDoctor dry-run does not hash archives", () => {
  const env = runDoctor({ root, dryRun: true });
  assert.equal(env.ok, true);
  assert.equal(env.dryRun, true);
  assert.ok(!env.evidence.some((item) => item.kind === "kit-hash"));
});
