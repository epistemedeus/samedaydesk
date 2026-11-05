// Residual need: the part of a caller's wanted result that a reused decision and
// its saved capture cannot answer. This module only projects. It does not post,
// fetch, pay, contact anyone or write a store. The cheap direct route is the
// default: a field the decision already answers stays direct, and a field the
// saved capture holds is a direct rerun of the same recipe. Only a field that is
// absent from the capture becomes a residual need, shaped as input for the
// existing unfunded market rails (cold requester `post`, then `offerVoluntary`,
// `assentVoluntary`, `deliverVoluntary`, `reviewVoluntary`). Those rails carry
// paymentAuthority none and create no obligation.
import { decideOrReuse } from "./export.mjs";
import { containsHostileMarkup, credentialHits, looksLikeFilesystemPath } from "./omit.mjs";

export const RESIDUAL_SCHEMA = "samedaydesk.result-reuse.residual-need.v1";
export const RESIDUAL_RIGHTS = Object.freeze({
  license: "CC0-1.0",
  scope: "synthetic-or-authorized-reusable-artifact",
});
const FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MARKET_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const TITLE_MAX_BYTES = 160;
const SUMMARY_MAX_BYTES = 4096;
const WANT_MAX = 16;
const UNPAID = Object.freeze({
  funding: "voluntary",
  paymentAuthority: "none",
  paidWork: false,
  debtCreated: false,
  obligationId: null,
  sent: false,
});

export function residualNeed(saved, manifest, options = {}) {
  const wanted = readWanted(options.want);
  if (!wanted.ok) return wanted;
  const acceptance = readAcceptance(options.acceptance);
  if (!acceptance.ok) return acceptance;

  const decision = decideOrReuse(saved, manifest, options);
  if (!decision.ok) return decision;
  if (decision.verdict !== "reuse") {
    // A miss is answered by recomputing the whole task directly. The whole task
    // is never sent to someone else.
    return {
      ok: true,
      schema: RESIDUAL_SCHEMA,
      route: "recompute",
      reason: decision.reason,
      message: decision.message,
      producerInvoked: false,
      residual: null,
      ...UNPAID,
    };
  }

  // verification-reconcile answers a no-change claim, not named content fields.
  // Do not rename that recipe into a source-change remainder post.
  if (decision.recipeId !== "source-change-alert") {
    if (wanted.fields.length === 0) {
      return {
        ok: true,
        schema: RESIDUAL_SCHEMA,
        route: "direct",
        verdict: decision.verdict,
        producerInvoked: false,
        decision: decision.decision,
        direct: { fields: [] },
        directRerun: null,
        residual: null,
        message: `${decision.recipeId} is reused as a whole decision and does not project named content fields`,
        ...UNPAID,
      };
    }
    return {
      ok: true,
      schema: RESIDUAL_SCHEMA,
      route: "recompute",
      reason: "unsupported_field_remainder",
      message: `${decision.recipeId} does not answer named content fields from this capture; direct recompute stays the path`,
      producerInvoked: false,
      residual: null,
      ...UNPAID,
    };
  }

  const answered = answeredFields(decision.decision.useful);
  const inCapture = captureFields(manifest);
  const direct = [];
  const rerun = [];
  const unresolved = [];
  for (const field of wanted.fields) {
    if (answered.has(field)) direct.push(field);
    else if (inCapture.has(field)) rerun.push(field);
    else unresolved.push(field);
  }
  const base = {
    ok: true,
    schema: RESIDUAL_SCHEMA,
    verdict: decision.verdict,
    producerInvoked: false,
    decision: decision.decision,
    direct: { fields: direct },
    directRerun: rerun.length
      ? {
          fields: rerun,
          recipeId: decision.recipeId,
          watchFields: [...new Set([...(manifest.fields || []), ...rerun])],
          note: "the saved capture already holds these fields; rerun the same recipe with them watched",
        }
      : null,
    ...UNPAID,
  };
  if (!unresolved.length) {
    return { ...base, route: rerun.length ? "direct_rerun" : "direct", residual: null };
  }
  const residual = buildResidual(unresolved, manifest, acceptance.text);
  if (!residual.ok) return residual;
  return { ...base, route: "residual_need", residual: residual.value };
}

function buildResidual(fields, manifest, acceptanceText) {
  const host = new URL(manifest.capture.url).host;
  const criterion = `remainder:${fields.join("/")}`;
  const title = `Residual fields ${fields.join(", ")} for ${host}`;
  const summary = [
    `A reused ${manifest.recipeId} decision on ${manifest.capture.url} answers the other wanted fields.`,
    `The saved public capture does not contain: ${fields.join(", ")}.`,
    `Deliver only those fields with their public source. ${acceptanceText}`,
    "Interest only; no commission or payout is offered.",
  ].join(" ");
  if (!MARKET_KEY.test(criterion)) return refuse("residual criterion exceeds the market key limit");
  if (Buffer.byteLength(title, "utf8") > TITLE_MAX_BYTES) return refuse("residual title exceeds the market title limit");
  if (Buffer.byteLength(summary, "utf8") > SUMMARY_MAX_BYTES) return refuse("residual summary exceeds the market summary limit");
  for (const value of [title, summary, criterion]) {
    if (credentialHits(value).length || containsHostileMarkup(value) || looksLikeFilesystemPath(value)) {
      return refuse("residual text contains disallowed sensitive or executable-shaped text");
    }
  }
  return {
    ok: true,
    value: {
      fields,
      post: { title, summary, criteria: [criterion], payableKinds: ["usable"] },
      coldRequesterPost: ["post", "--title", title, "--summary", summary, "--criterion", criterion],
      // The requester decides who to offer to after reading interest, and
      // affirms authorizedToRequest. Nothing is preset to true.
      offerVoluntaryInput: {
        taskId: null,
        contributorId: null,
        authorizedToRequest: false,
        rights: { ...RESIDUAL_RIGHTS, attribution: null },
      },
      acceptance: {
        criterionId: criterion,
        evidenceKind: "usable",
        requesterReviewRequired: true,
        passedMeans: `each of ${fields.join(", ")} is present with a public source`,
      },
      rails: [
        "cold-requester post",
        "cold-requester proposals",
        "cold-requester act --action offerVoluntary",
        "cold-requester inspect (contributor)",
        "cold-requester act --action assentVoluntary (contributor)",
        "cold-requester act --action deliverVoluntary (contributor)",
        "cold-requester act --action reviewVoluntary",
      ],
    },
  };
}

function answeredFields(useful) {
  const out = new Set();
  for (const row of [...(useful?.evidence?.changed || []), ...(useful?.evidence?.unchanged || [])]) {
    if (row && typeof row.field === "string") out.add(row.field);
  }
  return out;
}

function captureFields(manifest) {
  const fields = manifest?.capture?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return new Set();
  return new Set(Object.keys(fields).filter((key) => fields[key] !== null && fields[key] !== undefined && fields[key] !== ""));
}

function readWanted(value) {
  if (value == null) return { ok: true, fields: [] };
  if (!Array.isArray(value) || value.length > WANT_MAX) return refuse(`--want must name at most ${WANT_MAX} fields`);
  const fields = [];
  for (const field of value) {
    if (typeof field !== "string" || !FIELD.test(field) || credentialHits(field).length) {
      return refuse("--want fields must be plain field names");
    }
    if (!fields.includes(field)) fields.push(field);
  }
  return { ok: true, fields };
}

function readAcceptance(value) {
  const text = value == null ? "The requester reviews the delivery against this need." : value;
  if (typeof text !== "string" || text.trim() === "" || Buffer.byteLength(text, "utf8") > 512) {
    return refuse("--acceptance must be at most 512 bytes of text");
  }
  if (credentialHits(text).length || containsHostileMarkup(text) || looksLikeFilesystemPath(text)) {
    return refuse("--acceptance contains disallowed sensitive or executable-shaped text");
  }
  return { ok: true, text };
}

function refuse(message) {
  return { ok: false, message };
}
