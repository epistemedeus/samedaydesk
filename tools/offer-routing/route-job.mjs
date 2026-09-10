#!/usr/bin/env node
/**
 * Task-to-existing-offer cold router.
 * Reads the local capability/limits matrix; never invents payment or live hosting.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MATRIX_PATH = join(here, "capability-limits-matrix.json");

export function loadMatrix(path = MATRIX_PATH) {
  const matrix = JSON.parse(readFileSync(path, "utf8"));
  if (matrix.schema !== "samedaydesk.offer-capability-limits.v1") {
    throw new Error("unsupported_matrix_schema");
  }
  if (!Array.isArray(matrix.offers) || matrix.offers.length === 0) {
    throw new Error("matrix_missing_offers");
  }
  return matrix;
}

function normalizeJob(job) {
  if (!job || typeof job !== "object") throw new Error("job_required");
  const type = String(job.type || job.jobType || "").trim();
  if (!type) throw new Error("job_type_required");
  const constraints = Array.isArray(job.constraints)
    ? job.constraints.map(String)
    : [];
  return {
    jobId: job.jobId || job.id || null,
    type,
    title: job.title || null,
    constraints,
    raw: job,
  };
}

function prefersOffline(constraints) {
  return (
    constraints.includes("offline_preferred") ||
    constraints.includes("no_payment") ||
    constraints.includes("offline_only")
  );
}

function hostingRank(offer, offlinePreferred) {
  const h = offer.hosting || "";
  if (!offlinePreferred) {
    if (h === "live_paid_http") return 2;
    if (h.includes("live_free")) return 1;
    return 0;
  }
  if (h === "offline_local") return 40;
  if (h === "hosted_archive_download_local_execution") return 35;
  if (h === "live_free_http_or_offline_fixture") return 20;
  if (h === "unhosted_sample_local_rehearsal") return 10;
  if (h === "unhosted_prototype") return 5;
  if (h === "live_paid_http") return -100;
  return 0;
}

/** Select the correct existing offer for a supplied job brief. */
export function routeJob(jobInput, { matrix = loadMatrix() } = {}) {
  const job = normalizeJob(jobInput);
  const offlinePreferred = prefersOffline(job.constraints);
  const candidates = matrix.offers.filter(
    (o) => Array.isArray(o.supportsJobTypes) && o.supportsJobTypes.includes(job.type),
  );

  const rejected = [];
  for (const offer of matrix.offers) {
    if (Array.isArray(offer.notFor) && offer.notFor.includes(job.type)) {
      rejected.push({
        offerId: offer.id,
        reason: "job_type_in_notFor",
        commonMistake: offer.commonMistake || null,
      });
    }
  }

  if (job.type === "complete_issue_discussion") {
    for (const bad of ["sdd.paid_html_extract", "sdd.paid_html_read"]) {
      if (!rejected.some((r) => r.offerId === bad)) {
        rejected.push({
          offerId: bad,
          reason: "hard_rule_no_extract_for_issue_comments",
          commonMistake: "paid_html_extraction_for_complete_issue_comments",
        });
      }
    }
  }

  if (job.type === "moltjobs_sdk_rehearsal") {
    const sample = matrix.offers.find((o) => o.id === "neo.moltjobs_openai_agents_sample");
    if (sample && sample.hosting !== "unhosted_sample_local_rehearsal") {
      throw new Error("matrix_hosting_inconsistent_for_moltjobs_sample");
    }
  }

  const noPayment = job.constraints.includes("no_payment") || job.constraints.includes("offline_only");
  const eligible = [];
  for (const offer of candidates) {
    if (rejected.some((r) => r.offerId === offer.id)) continue;
    if (job.type === "complete_issue_discussion") {
      rejected.push({ offerId: offer.id, reason: "complete_issue_acquisition_unavailable" });
      continue;
    }
    if (job.constraints.includes("offline_only") && offer.hosting === "live_paid_http") {
      rejected.push({ offerId: offer.id, reason: "constraint_offline_only" });
      continue;
    }
    if (noPayment && offer.payment && offer.payment !== "none") {
      rejected.push({
        offerId: offer.id,
        reason: "constraint_no_payment",
        commonMistake: offer.commonMistake || null,
      });
      continue;
    }
    eligible.push(offer);
  }

  const ranked = eligible
    .map((offer) => ({
      offer,
      score: hostingRank(offer, offlinePreferred) + (offer.replacesMistakenRoute ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      schema: "samedaydesk.offer-route.v1",
      ok: false,
      job,
      selected: null,
      rejected,
      warnings: [job.type === "complete_issue_discussion" ? "complete_issue_acquisition_unavailable" : "no_matching_offer"],
      nextAction: job.type === "complete_issue_discussion"
        ? "Obtain issue body and paginated comments from the official GitHub API, preserving coverage limits. No published complete-discussion acquisition pack is asserted here. Use supplied_issue_brief only to process already-held evidence or fixtures."
        : "Review missing capabilities or constraints; do not purchase an incompatible route.",
      avoidedMistakes: [...new Set(rejected.map((r) => r.commonMistake).filter(Boolean))],
      criteriaAssessment: "not_evaluated",
      executionAuthorized: false,
      paymentRequired: false,
      offlineUntilHosted: false,
      paid: false,
    };
  }

  const selected = ranked[0].offer;
  const mistaken = rejected.filter((r) => r.commonMistake);
  // Selection is advice, not execution, payment, or proof of acceptance.
  const offlineUntilHosted = false;

  return {
    schema: "samedaydesk.offer-route.v1",
    ok: true,
    job,
    selected: {
      offerId: selected.id,
      product: selected.product,
      title: selected.title,
      artifact: selected.artifact,
      hosting: selected.hosting,
      payment: selected.payment,
      publicSurface: selected.publicSurface || null,
      archive: selected.archive || null,
      archiveSha256: selected.archiveSha256 || null,
      literalCommand: selected.literalCommand || null,
      limits: selected.limits || [],
    },
    alternates: ranked.slice(1).map((r) => ({
      offerId: r.offer.id,
      hosting: r.offer.hosting,
      payment: r.offer.payment,
      score: r.score,
    })),
    rejected,
    avoidedMistakes: [...new Set(mistaken.map((m) => m.commonMistake).filter(Boolean))],
    offlineUntilHosted,
    paid: false,
    paymentRequired: selected.payment !== "none",
    criteriaAssessment: "not_evaluated",
    executionAuthorized: false,
    executionMode: selected.hosting === "live_paid_http" ? "paid_remote_request_requires_caller_decision"
      : selected.hosting === "live_free_http_or_offline_fixture" ? "explicit_live_free_or_fixture"
      : "local",
    requiresHostedWorkflow: false,
    matrixPath: "tools/offer-routing/capability-limits-matrix.json",
  };
}

export function routeJobFromFile(jobPath, opts) {
  const job = JSON.parse(readFileSync(resolve(jobPath), "utf8"));
  return routeJob(job, opts);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(
      "Usage: node tools/offer-routing/route-job.mjs <job.json>\n" +
        "       node tools/offer-routing/route-job.mjs --matrix\n",
    );
    process.exit(args.length === 0 ? 1 : 0);
  }
  if (args[0] === "--matrix") {
    process.stdout.write(JSON.stringify(loadMatrix(), null, 2) + "\n");
    return;
  }
  const result = routeJobFromFile(args[0]);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) process.exitCode = 2;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) main(process.argv);

