import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "../../..");
export const PAIRS_DIR = join(HERE, "fixtures/pairs");
export const KIT_ARCHIVE = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
);
export const KIT_PIN = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/useful-jobs-1.4.0.sha256.json",
);
export const RELEASED_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const RELEASED_BYTES = 2575215;

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assertReleasedArchive() {
  const pin = JSON.parse(readFileSync(KIT_PIN, "utf8"));
  const buf = readFileSync(KIT_ARCHIVE);
  const digest = createHash("sha256").update(buf).digest("hex");
  if (buf.length !== RELEASED_BYTES || digest !== RELEASED_SHA256) {
    throw new Error(`released 1.4.0 archive pin mismatch ${buf.length} ${digest}`);
  }
  if (pin.sha256 !== RELEASED_SHA256 || pin.bytes !== RELEASED_BYTES) {
    throw new Error("sha256.json disagrees with published provenance");
  }
  return { bytes: buf.length, sha256: digest, pin };
}

export function extractReleasedKit(dest = mkdtempSync(join(tmpdir(), "uj140-vfc-"))) {
  assertReleasedArchive();
  const tar = spawnSync("tar", ["-xzf", KIT_ARCHIVE, "-C", dest], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
  const kit = join(dest, "useful-jobs-1.4.0");
  if (!existsSync(join(kit, "bin/useful-jobs.mjs"))) {
    throw new Error("extract missing bin/useful-jobs.mjs");
  }
  return kit;
}

export function listPairs() {
  return readdirSync(PAIRS_DIR)
    .filter((name) => existsSync(join(PAIRS_DIR, name, "expected.json")))
    .sort();
}

export function loadPair(id) {
  const dir = join(PAIRS_DIR, id);
  return {
    id,
    dir,
    source: JSON.parse(readFileSync(join(dir, "SOURCE.json"), "utf8")),
    before: JSON.parse(readFileSync(join(dir, "before.json"), "utf8")),
    after: JSON.parse(readFileSync(join(dir, "after.json"), "utf8")),
    expected: JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")),
    beforePath: join(dir, "before.json"),
    afterPath: join(dir, "after.json"),
  };
}

export function runVendorBudget({ kit, beforePath, afterPath, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const proc = spawnSync(
    process.execPath,
    [
      join(kit, "bin/useful-jobs.mjs"),
      "run",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8", cwd: kit, timeout: 60_000 },
  );
  let receipt = null;
  try {
    receipt = JSON.parse(String(proc.stdout || "").trim());
  } catch {
    receipt = null;
  }
  const artifactPath = join(outDir, "budget-impact.json");
  const artifact = existsSync(artifactPath)
    ? JSON.parse(readFileSync(artifactPath, "utf8"))
    : null;
  return { proc, receipt, artifact };
}

export function independentDeltas(before, after) {
  const beforeMap = Object.fromEntries((before.rows || []).map((row) => [row.field, row]));
  const afterMap = Object.fromEntries((after.rows || []).map((row) => [row.field, row]));
  const keys = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
  const rows = [];
  for (const field of keys) {
    const left = beforeMap[field];
    const right = afterMap[field];
    if (!left && right) {
      rows.push({ field, kind: "added", after: right.value, unit: right.unit });
      continue;
    }
    if (left && !right) {
      rows.push({ field, kind: "removed", before: left.value, unit: left.unit });
      continue;
    }
    if (left.unit !== right.unit) {
      rows.push({
        field,
        kind: "unit-change",
        before: left.value,
        after: right.value,
        beforeUnit: left.unit,
        afterUnit: right.unit,
      });
      continue;
    }
    if (left.value !== right.value) {
      rows.push({
        field,
        kind: "field-change",
        before: left.value,
        after: right.value,
        delta: right.value - left.value,
        unit: left.unit,
      });
    }
  }
  return rows;
}

export function hypotheticalGpt35() {
  const inputTokens = 10_000_000;
  const outputTokens = 2_000_000;
  const perK = (tokens, pricePer1k) => (tokens / 1000) * pricePer1k;
  const beforeUsd = perK(inputTokens, 0.0015) + perK(outputTokens, 0.002);
  const afterUsd = perK(inputTokens, 0.0005) + perK(outputTokens, 0.0015);
  return {
    label: "hypothetical-usage",
    notACustomerInvoice: true,
    pair: "openai-gpt35-turbo-20230613-20240125",
    usage: { inputTokens, outputTokens },
    tariff: "standard unpinned GPT-3.5 Turbo list, USD/1K-tokens, no batch/cache/fine-tune",
    beforeUsd,
    afterUsd,
    deltaUsd: afterUsd - beforeUsd,
    missingBeforeAnyBill: [
      "actual token counts from a provider receipt",
      "batch versus standard channel",
      "fine-tuned SKU",
      "cached input tokens",
      "tax and committed spend tiers",
    ],
  };
}
