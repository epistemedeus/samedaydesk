#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { redact } from "./local-journey.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const catalogPath = path.join(repoRoot, "client/public/for-agents/useful-jobs/catalog.json");
const discoveryPath = path.join(repoRoot, "client/public/discovery/useful-jobs.json");
const pageSourcePath = path.join(repoRoot, "client/src/data/machineEntry.mjs");
const kitPath = path.join(repoRoot, "client/src/data/usefulJobsKit.json");
const ORIGIN = "https://samedaydesk.com";
const JOB_ID = "lockfile-pin-delta";

const BECOMES_TRUE_ONLY_AFTER_ROOT = Object.freeze([
  "public_correspondence_healthz_enabled",
  "public_foundry_facade",
  "public_visitor_restart_retrieval_on_enrolled_store",
]);

const TRUE_WHILE_HOLD = Object.freeze([
  "public_useful_jobs_catalog_retrievable",
  "human_useful_jobs_page_unchanged",
  "private_store_restart_retrieval_is_not_production_activation",
  "production_ready_false",
]);

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.exitCode ?? (result.ok ? 0 : 1));
}

function hold(code, reason) {
  return {
    ok: false,
    exitCode: 1,
    code,
    reason,
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    secretsCopied: false,
    humanPagesChanged: false,
  };
}

async function readPublic(pathname) {
  const response = await fetch(`${ORIGIN}${pathname}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { accept: pathname.endsWith(".json") ? "application/json" : "text/html" },
  });
  const body = await response.text();
  return { status: response.status, body };
}

function humanPagesDirty() {
  const ran = spawnSync("git", [
    "diff",
    "--name-only",
    "--",
    "client/src/data/machineEntry.mjs",
    "client/src/data/usefulJobsKit.json",
    "client/public/for-agents/useful-jobs/catalog.json",
    "client/public/discovery/useful-jobs.json",
    "client/src/pages",
  ], { cwd: repoRoot, encoding: "utf8" });
  return ran.stdout.trim();
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    const dirty = humanPagesDirty();
    if (dirty) {
      emit({ ...hold("human_pages_changed", "source_dirty"), humanPagesChanged: true, paths: dirty.split("\n") });
    }
    const catalogText = await readFile(catalogPath, "utf8");
    const discoveryText = await readFile(discoveryPath, "utf8");
    const catalog = JSON.parse(catalogText);
    const discovery = JSON.parse(discoveryText);
    const pageSource = await readFile(pageSourcePath, "utf8");
    const kit = JSON.parse(await readFile(kitPath, "utf8"));
    if (catalog.jobs?.[0]?.id !== JOB_ID || !kit.jobs.includes(JOB_ID)) {
      emit(hold("useful_job_missing", "repo_catalog"));
    }
    const liveCatalog = await readPublic("/for-agents/useful-jobs/catalog.json");
    const liveDiscovery = await readPublic("/discovery/useful-jobs.json");
    const livePage = await readPublic("/for-agents/useful-jobs");
    if (liveCatalog.status !== 200 || liveDiscovery.status !== 200 || livePage.status !== 200) {
      emit(hold("hosted_path_unavailable", "public_http"));
    }
    const liveCatalogJson = JSON.parse(liveCatalog.body);
    const catalogMatchesRepo = sha256(catalogText) === sha256(liveCatalog.body);
    const discoveryMatchesRepo = sha256(discoveryText) === sha256(liveDiscovery.body);
    const jobPresent = liveCatalogJson.jobs?.some((job) => job.id === JOB_ID) === true;
    const pageIsHuman = livePage.body.includes("Offline useful jobs") && livePage.body.includes("/for-agents/useful-jobs/catalog.json");
    const pageClaimsActivation = /productionReady"\s*:\s*true|FOUNDRY_PRODUCTION_ACTIVATE|postgres(?:ql)?:\/\//i.test(livePage.body);
    if (!jobPresent || !pageIsHuman || pageClaimsActivation || !catalogMatchesRepo || !discoveryMatchesRepo) {
      emit({
        ...hold("hosted_catalog_drifted", "public_surface"),
        catalogMatchesRepo,
        discoveryMatchesRepo,
        jobPresent,
        pageIsHuman,
        pageClaimsActivation,
      });
    }
    if (!pageSource.includes("USEFUL_JOBS_PATH") || discovery.package !== "useful-jobs" || kit.paidHostedClaim !== false) {
      emit(hold("useful_job_missing", "page_source"));
    }
    emit({
      ok: true,
      exitCode: 0,
      code: "hosted_useful_job_later_retrieval",
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
      secretsCopied: false,
      panelEnvRead: false,
      hostingerChanged: false,
      humanPagesChanged: false,
      hostedUsefulJob: {
        path: "/for-agents/useful-jobs/catalog.json",
        page: "/for-agents/useful-jobs",
        discovery: "/discovery/useful-jobs.json",
        jobId: JOB_ID,
        version: liveCatalogJson.version,
        retrieved: true,
        catalogSha256: sha256(liveCatalog.body),
        catalogMatchesRepo: true,
        discoveryMatchesRepo: true,
        paidHostedClaim: false,
      },
      trueWhileHold: TRUE_WHILE_HOLD,
      becomesTrueOnlyAfterRootActivation: BECOMES_TRUE_ONLY_AFTER_ROOT,
      stillFalseAfterRootRestartUntilThisPackageChanges: ["productionActivate", "productionReady"],
    });
  } catch (error) {
    emit({
      ...hold("later_retrieval_failed", "probe"),
      detail: redact(error instanceof Error ? error.message : error),
    });
  }
}
