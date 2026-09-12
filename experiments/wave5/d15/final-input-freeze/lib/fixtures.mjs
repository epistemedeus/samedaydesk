import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { productFixture } from "./product.mjs";
import { sha256File } from "./sha.mjs";

function work(label) {
  return mkdtempSync(join(tmpdir(), `d15-final-${label}-`));
}

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return dest;
}

export function stageLock(root, { same = false } = {}) {
  const dir = work("lock");
  const before = copy(productFixture(root, "tools/lockfile-pin-delta/fixtures/journey/before.json"), join(dir, "before.json"));
  const afterSrc = same
    ? productFixture(root, "tools/lockfile-pin-delta/fixtures/journey/before.json")
    : productFixture(root, "tools/lockfile-pin-delta/fixtures/journey/after.json");
  const after = copy(afterSrc, join(dir, "after.json"));
  const overlay = copy(before, join(dir, "overlay-no-change.json"));
  return {
    dir,
    before,
    after,
    overlay,
    inspectAfter: sha256File(after),
    inspectBefore: sha256File(before),
  };
}

export function stageSchema(root, kind = "changed") {
  const dir = work("schema");
  if (kind === "partial") {
    const before = copy(productFixture(root, "experiments/wave5/m01/fixtures/schema/min-before.json"), join(dir, "before.json"));
    const after = copy(productFixture(root, "experiments/wave5/m01/fixtures/schema/min-after.json"), join(dir, "after.json"));
    const used = copy(productFixture(root, "experiments/wave5/m01/fixtures/schema/used-x.json"), join(dir, "used.json"));
    return {
      dir,
      before,
      after,
      used,
      overlay: copy(before, join(dir, "overlay-no-change.json")),
      inspectAfter: sha256File(after),
      inspectUsed: sha256File(used),
    };
  }
  const before = copy(productFixture(root, "tools/json-schema-webhook-drift/fixtures/journey/before.json"), join(dir, "before.json"));
  const afterSrc =
    kind === "same"
      ? productFixture(root, "tools/json-schema-webhook-drift/fixtures/journey/before.json")
      : productFixture(root, "tools/json-schema-webhook-drift/fixtures/journey/after.json");
  const after = copy(afterSrc, join(dir, "after.json"));
  const used = copy(productFixture(root, "tools/json-schema-webhook-drift/fixtures/journey/used.json"), join(dir, "used.json"));
  return {
    dir,
    before,
    after,
    used,
    overlay: copy(before, join(dir, "overlay-no-change.json")),
    inspectAfter: sha256File(after),
    inspectUsed: sha256File(used),
  };
}

export function stageRoute(root, { same = false } = {}) {
  const dir = work("route");
  const before = copy(productFixture(root, "tools/route-table-diff/fixtures/journey/before.json"), join(dir, "before.json"));
  const afterSrc = same
    ? productFixture(root, "tools/route-table-diff/fixtures/journey/before.json")
    : productFixture(root, "tools/route-table-diff/fixtures/journey/after.json");
  const after = copy(afterSrc, join(dir, "after.json"));
  return {
    dir,
    before,
    after,
    overlay: copy(before, join(dir, "overlay-no-change.json")),
    inspectAfter: sha256File(after),
  };
}

export function stagePage(root, { same = false } = {}) {
  const dir = work("page");
  const srcDir = same
    ? "tools/page-change-offline-job/fixtures/unchanged"
    : "tools/page-change-offline-job/fixtures/customer-job";
  const job = copy(productFixture(root, `${srcDir}/job.json`), join(dir, "job.json"));
  const before = copy(productFixture(root, `${srcDir}/before.json`), join(dir, "before.json"));
  const after = copy(productFixture(root, `${srcDir}/after.json`), join(dir, "after.json"));
  const overlay = copy(before, join(dir, "overlay-no-change.json"));
  const mutatedJob = join(dir, "overlay-job.json");
  const spec = JSON.parse(readFileSync(job, "utf8"));
  spec.title = `${spec.title} [mutated-after-prepare]`;
  writeFileSync(mutatedJob, `${JSON.stringify(spec, null, 2)}\n`);
  return {
    dir,
    job,
    before,
    after,
    overlay,
    mutatedJob,
    inspectJob: sha256File(job),
    inspectAfter: sha256File(after),
    inspectBefore: sha256File(before),
  };
}

export function writePlan(dir, ops) {
  const path = join(dir, "d15-freeze-plan.json");
  writeFileSync(path, `${JSON.stringify({ ops }, null, 2)}\n`);
  return path;
}
