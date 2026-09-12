import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PATH, MODULE_DIR } from "../lib/pins.mjs";
import { d01Fixture, ensureD01Root, spawnPaidWrapper } from "../lib/d01.mjs";
import { loadVerifyComplete } from "../lib/d03.mjs";
import { satisfyJob } from "../lib/satisfy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const TEST_DIR = here;
export const CONTAMINATION_CLI = join(MODULE_DIR, "bin/contamination.mjs");
export const CATALOG = CATALOG_PATH;

let cachedD01 = null;
let cachedD03 = null;

export function d01Root() {
  if (!cachedD01) cachedD01 = ensureD01Root();
  return cachedD01;
}

export { spawnPaidWrapperAsync } from "../lib/d01.mjs";
export { d01Fixture };

export async function d03() {
  if (!cachedD03) cachedD03 = await loadVerifyComplete();
  return cachedD03;
}

export function tempDir(prefix = "w5-d18-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function vendorBudgetArgs(root = d01Root()) {
  return [
    "--before",
    d01Fixture(root, "caller/vendor-budget-impact/before.json"),
    "--after",
    d01Fixture(root, "caller/vendor-budget-impact/after.json"),
    "--funding",
    "reserved-fixture",
    "--payment",
    d01Fixture(root, "payment/reserved-fixture.json"),
  ];
}

export function vendorBudgetNoChangeArgs(root = d01Root()) {
  const before = d01Fixture(root, "caller/vendor-budget-impact/before.json");
  return ["--before", before, "--after", before, "--funding", "unfunded"];
}

export function feedAgendaArgs(root = d01Root()) {
  return [
    "--before",
    d01Fixture(root, "caller/feed-agenda/before.xml"),
    "--after",
    d01Fixture(root, "caller/feed-agenda/after.xml"),
    "--funding",
    "unfunded",
  ];
}

export function runVendorBudget(outDir, extraArgs) {
  return spawnPaidWrapper({
    d01Root: d01Root(),
    jobId: "vendor-budget-impact",
    extraArgs: extraArgs || vendorBudgetArgs(),
    outDir,
  });
}

export function runFeedAgenda(outDir) {
  return spawnPaidWrapper({
    d01Root: d01Root(),
    jobId: "feed-agenda",
    extraArgs: feedAgendaArgs(),
    outDir,
  });
}

export async function satisfy(root, expectedJobId, extra = {}) {
  const loaded = await d03();
  return satisfyJob({
    root,
    expectedJobId,
    verifyComplete: loaded.verifyComplete,
    catalogPath: CATALOG,
    ...extra,
  });
}

export function readReceipt(outDir) {
  return JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
}

export function removeQuiet(path) {
  rmSync(path, { recursive: true, force: true });
}

export function hasFile(outDir, name) {
  return existsSync(join(outDir, name));
}
