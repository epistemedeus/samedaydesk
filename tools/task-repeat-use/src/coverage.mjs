import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mountedPublicRead } from "../../../vendor/hosted-wallet-market/src/public-route-limit.mjs";
import { MERCHANT_PIN as MACHINE_ENTRY_PIN } from "../../../client/src/data/machineEntry.mjs";
import { MERCHANT_INPUT_PIN } from "../../recurring-job-recipes/vendor/merchant-contracts.mjs";
import {
  ACCEPTED_WORK_RAIL,
  AGL_ROOT,
  COVERAGE_SCHEMA,
  INSTALLED_MERCHANT,
  MACHINE_ENTRY_MERCHANT_PIN,
  PUBLIC_ACCEPTED_WORK,
  PUBLIC_PREFIX,
  RECIPE_MERCHANT_PIN,
} from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../../..");

function readJson(path) {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));
}

/**
 * Receive AGL-ROOT15599 and the installed merchant as coverage.
 * Failure is closed: a drifted enrollment or a collapsed merchant pin does not
 * become a pass.
 */
export function loadCoverage() {
  const enrollment = readJson(AGL_ROOT.enrollmentPath);
  const proposal = readFileSync(join(REPO_ROOT, AGL_ROOT.proposalPath), "utf8");
  const combined = readFileSync(join(REPO_ROOT, AGL_ROOT.combinedResultPath), "utf8");
  const problems = [];

  if (enrollment.received !== false) problems.push("enrollment received flag drifted");
  if (enrollment.installed !== false) problems.push("enrollment installed flag drifted");
  if (enrollment.qualified !== false) problems.push("enrollment qualified flag drifted");
  if (!proposal.includes("Unreceived.")) problems.push("h155030 proposal is no longer unreceived");
  if (!combined.includes("AGL enrollment ROOT15599")) problems.push("combined result does not name AGL enrollment ROOT15599");
  if (MACHINE_ENTRY_PIN !== MACHINE_ENTRY_MERCHANT_PIN) problems.push("machine-entry merchant pin drifted");
  if (MERCHANT_INPUT_PIN !== RECIPE_MERCHANT_PIN) problems.push("recipe merchant pin drifted");
  if (MACHINE_ENTRY_PIN.startsWith(INSTALLED_MERCHANT.id)) problems.push("machine entry was relabeled as the installed merchant");
  if (MERCHANT_INPUT_PIN.startsWith(INSTALLED_MERCHANT.id)) problems.push("recipe pin was relabeled as the installed merchant");
  if (MERCHANT_INPUT_PIN === MACHINE_ENTRY_PIN) problems.push("recipe pin and machine-entry pin collapsed");

  const publicGet = mountedPublicRead(PUBLIC_PREFIX, PUBLIC_ACCEPTED_WORK, "GET");
  const publicPost = mountedPublicRead(PUBLIC_PREFIX, PUBLIC_ACCEPTED_WORK, "POST");
  if (publicGet !== true) problems.push("accepted-work GET is no longer a public read");
  if (publicPost !== false) problems.push("accepted-work POST became a public write");

  const coverage = {
    schema: COVERAGE_SCHEMA,
    ok: problems.length === 0,
    problems,
    agl: {
      id: AGL_ROOT.id,
      pr: AGL_ROOT.pr,
      head: AGL_ROOT.head,
      merge: AGL_ROOT.merge,
      combinedSource: AGL_ROOT.combinedSource,
      predecessor: AGL_ROOT.predecessor,
      installedAtThatReceiving: enrollment.installed === true,
      qualified: enrollment.qualified === true,
      received: enrollment.received === true,
      rebuiltHere: false,
    },
    merchant: {
      id: INSTALLED_MERCHANT.id,
      railway: INSTALLED_MERCHANT.railway,
      runtime: INSTALLED_MERCHANT.runtime,
      paidMpp: INSTALLED_MERCHANT.paidMpp,
      rail: INSTALLED_MERCHANT.rail,
      source: INSTALLED_MERCHANT.source,
      called: INSTALLED_MERCHANT.calledByThisPath,
      independentReuse: false,
    },
    distinctPins: {
      installedMerchant: INSTALLED_MERCHANT.id,
      machineEntry: MACHINE_ENTRY_PIN,
      recipeInput: MERCHANT_INPUT_PIN,
    },
    existingRails: {
      acceptedWork: ACCEPTED_WORK_RAIL,
      publicAcceptedWorkGet: publicGet,
      publicAcceptedWorkPost: publicPost,
      note: "H133 accepted-work, CLI, wallet, need, interest, terms, and acceptance stay on their owners.",
    },
    outsideUse: false,
    paymentEvidence: "none",
  };
  return coverage;
}
