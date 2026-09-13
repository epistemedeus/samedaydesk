import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { H4_BRANCH, H4_GIT_PREFIX, H4_WORKSPACE, SDS_ROOT } from "./paths.mjs";

export const H4_FIXTURE_NAMES = Object.freeze({
  intact: "intact-payload.json",
  missingBazaar: "mismatch-missing-bazaar.json",
  missingResource: "mismatch-missing-resource.json",
  siblingPaymentRequirements: "sibling-payment-requirements.json",
});

const MERCHANT_MODULE_REL = "fixtures/merchant-pr54/indexing-payload-continuity.mjs";

function gitShow(spec) {
  const result = spawnSync("git", ["show", spec], {
    cwd: SDS_ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function readH4Path(relFromH4) {
  const workspace = join(H4_WORKSPACE, relFromH4);
  if (existsSync(workspace)) {
    return { source: "workspace", path: workspace, text: readFileSync(workspace, "utf8") };
  }
  const spec = `origin/${H4_BRANCH}:${H4_GIT_PREFIX}/${relFromH4}`;
  const text = gitShow(spec);
  if (text == null) return null;
  return { source: "git", path: spec, text };
}

export function h4TreePresent() {
  return existsSync(H4_WORKSPACE);
}

export function loadH4Fixtures() {
  const loaded = {};
  const sources = {};
  for (const [key, filename] of Object.entries(H4_FIXTURE_NAMES)) {
    const hit = readH4Path(`fixtures/${filename}`);
    if (!hit) continue;
    loaded[key] = JSON.parse(hit.text);
    sources[key] = hit.source;
  }
  return {
    present: Object.keys(loaded).length > 0,
    workspace: h4TreePresent(),
    branch: H4_BRANCH,
    ownedDir: H4_GIT_PREFIX,
    fixtures: loaded,
    sources,
  };
}

export async function importH4MerchantPlanner() {
  const workspace = join(H4_WORKSPACE, MERCHANT_MODULE_REL);
  if (existsSync(workspace)) {
    const mod = await import(pathToFileURL(workspace).href);
    return { present: true, source: "workspace", path: workspace, module: mod };
  }
  const spec = `origin/${H4_BRANCH}:${H4_GIT_PREFIX}/${MERCHANT_MODULE_REL}`;
  const text = gitShow(spec);
  if (!text) return { present: false, source: null, path: null, module: null };
  const dir = mkdtempSync(join(tmpdir(), "g02-h4-pr54-"));
  const dest = join(dir, "indexing-payload-continuity.mjs");
  writeFileSync(dest, text);
  const mod = await import(pathToFileURL(dest).href);
  return { present: true, source: "git", path: spec, module: mod };
}
