import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureUsefulJobsKit } from "../lib/engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const FIXTURES = join(OWNED, "fixtures");

export function callerBudget() {
  return {
    before: join(FIXTURES, "caller/vendor-budget-impact/before.json"),
    after: join(FIXTURES, "caller/vendor-budget-impact/after.json"),
  };
}

export function callerFeed() {
  return {
    before: join(FIXTURES, "caller/feed-agenda/before.xml"),
    after: join(FIXTURES, "caller/feed-agenda/after.xml"),
  };
}

export function callerEvidence() {
  return { input: join(FIXTURES, "caller/evidence-ci-annotation/input.json") };
}

export function callerRepeat() {
  return { "next-run": join(FIXTURES, "caller/repeat-job-record/next-run.json") };
}

export function loadReservedPayment() {
  return JSON.parse(readFileSync(join(FIXTURES, "payment/reserved-fixture.json"), "utf8"));
}

export function copyKitOpenApi(dest) {
  const kit = ensureUsefulJobsKit();
  mkdirSync(dest, { recursive: true });
  for (const name of ["before.yaml", "after.yaml", "used.json"]) {
    copyFileSync(join(kit, "samples/openapi/a", name), join(dest, name));
  }
  return {
    before: join(dest, "before.yaml"),
    after: join(dest, "after.yaml"),
    used: join(dest, "used.json"),
  };
}

export function copyKitListing(dest) {
  const kit = ensureUsefulJobsKit();
  mkdirSync(dest, { recursive: true });
  const out = join(dest, "listing.json");
  copyFileSync(join(kit, "samples/listing/caller-alpha.json"), out);
  return { input: out };
}
