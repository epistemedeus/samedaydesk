import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";
import { loadCoverage } from "./coverage.mjs";
import { walkRepeatUse } from "./journey.mjs";
import { CLOCK, HORIZON_HOURS, RECIPE_CLOCK, RECIPE_ID, RECIPE_VERSION, SUBJECT, TASK_ID } from "./pins.mjs";

const priorPath = join(import.meta.dirname, "../../recurring-job-recipes/fixtures/priors/source-change.prior.json");
const capturePath = join(import.meta.dirname, "../../recurring-job-recipes/fixtures/current/example-unchanged.json");

export const ORIGINAL_TERMS = Object.freeze({
  termsDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  earnedDebtAtomic: "21",
});

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function publicManifest(captureOverride = {}) {
  const prior = loadJson(priorPath);
  const capture = { ...loadJson(capturePath), ...captureOverride };
  return {
    recipeId: RECIPE_ID,
    recipeVersion: RECIPE_VERSION,
    prior: {
      sha256: prior.sha256,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      payload: {
        url: prior.payload.url,
        status: prior.payload.status,
        title: prior.payload.title,
        fields: prior.payload.fields,
        contentHash: prior.payload.contentHash,
      },
    },
    capture: {
      url: capture.url,
      status: capture.status,
      title: capture.title,
      fields: capture.fields,
      contentHash: capture.contentHash,
    },
  };
}

function verifyInput(candidatePath = capturePath) {
  return { priorPath, candidatePath, clock: RECIPE_CLOCK, horizonHours: HORIZON_HOURS };
}

export async function produceVerification(directInput = verifyInput()) {
  if (directInput?.recipeId === "comparable-record-extraction") {
    return runRecipe("comparable-record-extraction", {});
  }
  return runRecipe(RECIPE_ID, directInput);
}

function baseTask(extra = {}) {
  return {
    class: "already_public",
    signup: false,
    taskId: TASK_ID,
    subject: SUBJECT,
    sequence: 1,
    ...extra,
  };
}

async function retained() {
  const manifest = publicManifest();
  const produced = await produceVerification(verifyInput());
  return { manifest, produced, directInput: verifyInput() };
}

function actors(consumer = { actorId: "later-distinct-agent", party: "later_distinct_agent" }) {
  return {
    producer: { actorId: "agl-producer-owner", party: "first_party_owner" },
    consumer,
  };
}

export async function runCase(name) {
  const coverage = loadCoverage();
  if (!coverage.ok) return { ok: false, seam: "broken", code: "coverage_unreceived", coverage };

  if (name === "signup") {
    return walkRepeatUse({
      coverage,
      clock: CLOCK,
      originalTerms: { ...ORIGINAL_TERMS },
      task: baseTask({ signup: true }),
      ...actors(),
      permission: { optIn: true },
      paidChoice: { show: true },
    });
  }

  if (name === "terms-rewrite" || name === "debt-rewrite") {
    const terms = { ...ORIGINAL_TERMS };
    if (name === "terms-rewrite") terms.rewriteTerms = true;
    if (name === "debt-rewrite") terms.replacementEarnedDebtAtomic = "0";
    return walkRepeatUse({
      coverage,
      clock: CLOCK,
      originalTerms: terms,
      task: baseTask(),
      ...actors(),
    });
  }

  const { manifest, produced, directInput } = await retained();
  const shared = {
    coverage,
    clock: CLOCK,
    originalTerms: { ...ORIGINAL_TERMS },
    task: baseTask(),
    manifest,
    produced,
    directInput,
    permission: { optIn: true, withdrawn: false },
    paidChoice: { show: true },
    produce: produceVerification,
    compareDirect: true,
    ...actors(),
  };

  if (name === "fitting" || name === "identity") {
    return walkRepeatUse({
      ...shared,
      identity: name === "identity" ? { label: "later-agent" } : null,
      newTask: { manifest, directInput },
    });
  }

  if (name === "first-party") {
    return walkRepeatUse({
      ...shared,
      compareDirect: false,
      consumer: { actorId: "agl-producer-owner", party: "first_party_owner" },
      newTask: { manifest, directInput },
    });
  }

  if (name === "withdrawn") {
    return walkRepeatUse({
      ...shared,
      permission: { optIn: true, withdrawn: true },
      newTask: { manifest, directInput },
    });
  }

  if (name === "nonfitting-capture") {
    const changedHash = "sha256:fixture-example-domain-v2";
    const dir = mkdtempSync(join(tmpdir(), "task-repeat-use-"));
    const candidatePath = join(dir, "capture.json");
    const capture = { ...loadJson(capturePath), contentHash: changedHash };
    writeFileSync(candidatePath, `${JSON.stringify(capture)}\n`);
    const nextManifest = publicManifest({ contentHash: changedHash });
    return walkRepeatUse({
      ...shared,
      newTask: { manifest: nextManifest, directInput: verifyInput(candidatePath) },
    });
  }

  if (name === "private") {
    const nextManifest = publicManifest();
    nextManifest.authorization = "withheld";
    return walkRepeatUse({
      ...shared,
      compareDirect: false,
      newTask: { manifest: nextManifest },
    });
  }

  if (name === "unsupported") {
    const nextManifest = publicManifest();
    nextManifest.recipeId = "comparable-record-extraction";
    return walkRepeatUse({
      ...shared,
      newTask: { manifest: nextManifest, directInput: { recipeId: "comparable-record-extraction" } },
    });
  }

  if (name === "new-price") {
    return walkRepeatUse({
      ...shared,
      paidChoice: { show: true, price: "50000" },
      newTask: { manifest, directInput },
    });
  }

  return { ok: false, seam: "broken", code: "unknown_case", message: name };
}

export const CASE_NAMES = Object.freeze([
  "fitting",
  "identity",
  "signup",
  "first-party",
  "withdrawn",
  "nonfitting-capture",
  "private",
  "unsupported",
  "new-price",
  "terms-rewrite",
  "debt-rewrite",
]);
