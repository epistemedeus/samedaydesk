#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { factsFrom } from "./classify.mjs";
import {
  clientSurfaces,
  observationFromPublic,
  PRODUCT_DATA_HOST,
  validateMetadata,
} from "./client-contract.mjs";
import { redact } from "./local-journey.mjs";
import { observeOrigin } from "./observe.mjs";

const snapshotPath = fileURLToPath(new URL("./enrolled-public.json", import.meta.url));

export const ROOT_SETS = Object.freeze([
  "FOUNDRY_HOST_OPT_IN",
  "CORRESPONDENCE_DATABASE_URL",
  "CORRESPONDENCE_ADMIN_TOKEN",
  "CORRESPONDENCE_PG_SCHEMA",
  "CORRESPONDENCE_POOL_MAX",
  "CORRESPONDENCE_STORE",
  "CORRESPONDENCE_TRUST_PROXY",
  "CORRESPONDENCE_CORS_ORIGINS",
  "CORRESPONDENCE_BODY_LIMIT_BYTES",
  "FOUNDRY_HOST_PROFILE_FILE",
  "FOUNDRY_PARTICIPATION_KEY_FILE",
]);

export const ROOT_LEAVES = Object.freeze([
  "FOUNDRY_PRODUCTION_ACTIVATE",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_BUCKET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "PULSE_TOKEN",
]);

function hold(code, reason, extra = {}) {
  return {
    ok: false,
    exitCode: extra.exitCode || 1,
    code,
    reason,
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    panelEnvRead: false,
    secretsCopied: false,
  };
}

export function buildDelta(metadata) {
  const invalid = validateMetadata(metadata);
  if (invalid) return invalid;
  const observation = observationFromPublic(metadata);
  const facts = factsFrom(observation);
  const surfaces = clientSurfaces(observation);
  if (!surfaces.ok || !facts.disabledOptionalMount || facts.hostedDiscovery || facts.taskResult || facts.durableRetrieval) {
    return { ...hold("public_state_diverged", "disabled_mount_or_client_contract"), facts, reasons: surfaces.reasons };
  }
  const product = metadata.productDataService || {};
  if (product.kind !== "supabase" || product.host !== PRODUCT_DATA_HOST || product.configured !== true || product.secretCopied !== false) {
    return hold("product_data_service_unmatched", "product_host_or_secret_flag");
  }
  const correspondence = metadata.correspondenceDataService || {};
  if (correspondence.enrolled !== false || correspondence.schema !== "pilot_correspondence" || correspondence.separateFromProduct !== true) {
    return hold("correspondence_enrollment_unmatched", "correspondence_not_a_separate_unenrolled_service");
  }
  const cited = metadata.citedBuild || {};
  if (metadata.githubMain !== cited.commit || cited.entry !== "server/index.js" || cited.apiReread !== false || !cited.buildId) {
    return hold("cited_build_unmatched", "main_or_entry_or_api_reread");
  }
  if (metadata.origin !== "https://samedaydesk.com" || metadata.platform !== "hostinger" || metadata.secretsCopied !== false || metadata.panelEnvRead !== false) {
    return hold("enrolled_origin_unmatched", "origin_platform_or_panel_flag");
  }
  return {
    ok: true,
    exitCode: 0,
    code: "activation_delta",
    productionActivate: "HOLD",
    productionReady: false,
    hostingerChanged: false,
    launchedService: false,
    panelEnvRead: false,
    secretsCopied: false,
    hostingerApiReread: false,
    currentPublicState: "disabled_optional_mount",
    origin: metadata.origin,
    measuredAt: metadata.measuredAt,
    deployedCommit: metadata.githubMain,
    citedBuildId: cited.buildId,
    entry: cited.entry,
    node: cited.node,
    framework: cited.framework,
    inferredAbsentBecauseHealthzUnconfigured: [
      "FOUNDRY_HOST_OPT_IN",
      "CORRESPONDENCE_DATABASE_URL",
      "CORRESPONDENCE_ADMIN_TOKEN",
    ],
    envNamesRootSetsAfterInstaller: ROOT_SETS,
    installerOnly: ["FOUNDRY_PRIVATE_PROFILE_FILE"],
    envNamesRootLeaves: ROOT_LEAVES,
    productDataService: {
      kind: "supabase",
      host: PRODUCT_DATA_HOST,
      configured: true,
      reusedForCorrespondence: false,
      secretCopied: false,
    },
    correspondenceDataService: {
      enrolled: false,
      schema: "pilot_correspondence",
      separateFromProduct: true,
    },
    clientContract: surfaces.stamp,
    rootSteps: [
      "Confirm node server/foundry/activation/delta.mjs --live still exits 0.",
      "Authorize a Postgres URL that does not contain the product Supabase project ref.",
      "Place mode 0600 host profile, participation key, and installer-only private profile outside the repo.",
      "Run node server/foundry/install.mjs --migrate and then --migrate --install against that URL.",
      "Set envNamesRootSetsAfterInstaller on the existing Hostinger app. Do not copy product service keys into them.",
      "Restart the process that runs node server/index.js.",
      "Leave FOUNDRY_PRODUCTION_ACTIVATE unset or HOLD.",
    ],
    rollback: "Unset the foundry and correspondence names, restart node server/index.js, keep schema pilot_correspondence, and leave the product Supabase, Stripe, and email settings in place.",
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

function branchContainedIn(mainSha) {
  if (!/^[0-9a-f]{40}$/.test(String(mainSha || ""))) return null;
  const ran = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", mainSha], { encoding: "utf8" });
  if (ran.status !== 0 && ran.status !== 1) return null;
  return ran.status === 0;
}

async function productHost(origin) {
  const page = await fetch(`${origin}/`, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  const html = await page.text();
  const src = html.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!src) throw new Error("asset_missing");
  const script = await fetch(`${origin}${src[1]}`, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  const js = await script.text();
  const hosts = [...new Set([...js.matchAll(/https:\/\/([a-z0-9-]+\.supabase\.co)/g)].map((match) => match[1]))];
  if (hosts.length !== 1) throw new Error("product_host_ambiguous");
  return hosts[0];
}

function githubMain() {
  const ran = spawnSync("gh", ["api", "repos/epistemedeus/samedaydesk/commits/main", "--jq", ".sha"], { encoding: "utf8" });
  if (ran.status !== 0) return null;
  const sha = ran.stdout.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function viewFromObservation(observation) {
  const health = observation.sdsHealth || {};
  const configured = health.configured || {};
  const hz = observation.correspondenceHealthz || {};
  return {
    health: {
      status: health.status,
      service: health.service,
      ok: health.ok === true,
      configured: {
        supabase: configured.supabase === true,
        stripe: configured.stripe === true,
        email: configured.email === true,
      },
    },
    correspondenceHealthz: {
      status: hz.status,
      enabled: hz.body?.enabled === true,
      reason: hz.body?.reason ?? null,
    },
    foundryReceiverStatus: observation.foundryReceiver?.status ?? null,
    visitorEntryStatus: observation.visitorEntry?.status ?? null,
    uploadsStatus: observation.uploads?.status ?? null,
    mcp: observation.mcp || null,
  };
}

export async function liveAgrees(metadata) {
  const observation = await observeOrigin(metadata.origin);
  const healthResponse = await fetch(`${metadata.origin}/api/health`, { signal: AbortSignal.timeout(20000) });
  const platform = healthResponse.headers.get("platform");
  const host = await productHost(metadata.origin);
  const main = githubMain();
  const fields = [];
  if (!isDeepStrictEqual(viewFromObservation(observation), metadata.public)) fields.push("public");
  if (platform !== metadata.platform) fields.push("platform");
  if (host !== metadata.productDataService?.host) fields.push("productDataService.host");
  if (main !== metadata.githubMain) fields.push("githubMain");
  return { agrees: fields.length === 0, fields, platform, productHost: host, githubMain: main };
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.exitCode ?? (result.ok ? 0 : 1));
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    const fixture = argument("--fixture");
    const metadata = JSON.parse(await readFile(fixture || snapshotPath, "utf8"));
    const delta = buildDelta(metadata);
    const onMain = branchContainedIn(metadata.githubMain);
    const withGit = { ...delta, activationPackageOnMain: onMain, branchContainedInMain: onMain };
    if (!delta.ok || !process.argv.includes("--live") || fixture) emit(withGit);
    const live = await liveAgrees(metadata);
    if (!live.agrees) {
      emit({ ...hold("live_disagrees", "enrolled_public_snapshot"), fields: live.fields });
    }
    emit({ ...withGit, liveAgrees: true });
  } catch (error) {
    emit({ ...hold("live_probe_failed", "probe"), detail: redact(error instanceof Error ? error.message : error) });
  }
}
