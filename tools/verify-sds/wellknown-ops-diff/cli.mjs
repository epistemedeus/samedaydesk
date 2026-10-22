#!/usr/bin/env node
/**
 * SDS well-known ops vs bazaar-tracker diff.
 * Boundary: tools/verify-sds/wellknown-ops-diff/** only.
 * Offline. Never --live, never CDP, never PAYMENT-SIGNATURE / X-PAYMENT.
 *
 * Usage:
 *   node tools/verify-sds/wellknown-ops-diff/cli.mjs
 *   node tools/verify-sds/wellknown-ops-diff/cli.mjs diff [--json]
 *   node tools/verify-sds/wellknown-ops-diff/cli.mjs run
 *   node tools/verify-sds/wellknown-ops-diff/cli.mjs --seeded-failure <id>
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  COMPACT_TRACKER,
  COMPACT_WELLKNOWN,
  DEFAULT_TRACKER_ARTIFACT,
  DEFAULT_WELLKNOWN_ARTIFACT,
  PACK_ROOT,
  SEEDED,
  loadTracker,
  loadWellKnown,
  outputTouchesForbidden,
  resolvePath,
} from "./lib/catalog.mjs";
import { runDiff } from "./lib/diff.mjs";
import { envelope, emitEnvelope, exitFor, failError, FEATURE } from "./lib/envelope.mjs";
import {
  absenceAsDemandEnvelope,
  claimMatchEnvelope,
  ghostTrackerEnvelope,
  refuseLive,
  refusePaymentSignature,
  refuseStripePath,
  runSeeded,
} from "./lib/refuse.mjs";

function parseArgs(argv) {
  const out = {
    tokens: [],
    flags: {},
    seededId: null,
    help: false,
    json: true,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--pretty") out.pretty = true;
    else if (a === "--human") out.json = false;
    else if (a === "--seeded-failure") {
      out.seededId = argv[++i];
      if (!out.seededId) out.missing = "--seeded-failure";
    } else if (a === "--wellknown") out.flags.wellknown = argv[++i];
    else if (a === "--tracker") out.flags.tracker = argv[++i];
    else if (a === "--claim") out.flags.claim = argv[++i];
    else if (a === "--fixture") out.flags.fixture = argv[++i];
    else if (a === "--live") out.flags.live = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out.tokens.push(a);
    }
  }
  return out;
}

function usage() {
  return `sds wellknown-ops-diff — committed /.well-known/x402.json vs bazaar-tracker SDS routes

Commands:
  diff                    cold diff of committed well-known ops vs tracker (default)
  run                     harness: cold diff exit 0 + seeded refuses

Seeded failures (exit ≠ 0, paymentSent=false, liveFetch=false):
  --seeded-failure claim-match
  --seeded-failure absence-as-demand
  --seeded-failure ghost-tracker
  --seeded-failure live
  --seeded-failure payment-signature

Options:
  --wellknown PATH        well-known x402 JSON (default: fixtures/presence/catalog/x402.json)
  --tracker PATH          bazaar-tracker observations (default: data/bazaar-tracker/observations.json)
  --claim PATH            extra claim JSON evaluated against the diff
  --json / --pretty       JSON envelope on stdout
  --live                  refused (this pack is offline)

Catalog absence is not buyer demand. Never send PAYMENT-SIGNATURE, X-PAYMENT, or Stripe.
`;
}

function loadOptionalJson(path) {
  if (!path) return null;
  const full = resolvePath(path);
  if (!full || !existsSync(full)) {
    const alt = isAbsolute(path) ? path : join(PACK_ROOT, path);
    if (existsSync(alt)) return JSON.parse(readFileSync(alt, "utf8"));
    return null;
  }
  return JSON.parse(readFileSync(full, "utf8"));
}

function loadGhostTracker() {
  return loadTracker(join(PACK_ROOT, "fixtures/seeded/ghost-tracker.json"));
}

function diffEnvelope(wellKnown, tracker, { command = "diff", claims = null } = {}) {
  const report = runDiff({ wellKnown, tracker, claims });
  const forbidden = outputTouchesForbidden(report);
  if (forbidden.length) {
    return envelope({
      ok: false,
      command,
      feature: FEATURE,
      error: failError("PROTECTED_FIELD", "diff output would include payment terms", { forbidden }),
      result: { refused: true, paymentSent: false },
    });
  }
  return envelope({
    ok: report.ok,
    command,
    feature: FEATURE,
    evidence: [
      {
        kind: "artifacts",
        wellKnown: wellKnown.source,
        tracker: tracker.source,
        wellKnownCount: report.wellKnownCount,
        trackerCount: report.trackerCount,
      },
      {
        kind: "gap",
        aligned: report.aligned,
        wellKnownOnlyPathCount: report.wellKnownOnlyPathCount,
        trackerOnlyCount: report.trackerOnlyCount,
        catalogAbsenceIsDemand: false,
      },
    ],
    error: report.ok
      ? null
      : failError("DIFF_PIN", "well-known vs tracker pin or claim failed", { reasons: report.reasons }),
    result: report,
  });
}

function coldDiff(parsed) {
  const wellKnown = loadWellKnown(parsed.flags.wellknown || DEFAULT_WELLKNOWN_ARTIFACT);
  const tracker = loadTracker(parsed.flags.tracker || DEFAULT_TRACKER_ARTIFACT);
  const claims = parsed.flags.claim ? loadOptionalJson(parsed.flags.claim) : null;
  if (parsed.flags.claim && !claims) {
    return envelope({
      ok: false,
      command: "diff",
      status: "usage",
      error: failError("USAGE", `claim file not found: ${parsed.flags.claim}`),
    });
  }
  return diffEnvelope(wellKnown, tracker, { claims });
}

function seededFromDiff(seedId, parsed) {
  if (seedId === "live") return refuseLive();
  if (seedId === "payment-signature") {
    return refusePaymentSignature({ header: parsed.flags.header || "PAYMENT-SIGNATURE" });
  }
  if (seedId === "stripe-path") {
    return refuseStripePath({ path: parsed.flags.path || "/api/checkout" });
  }

  const wellKnown = loadWellKnown(parsed.flags.wellknown || DEFAULT_WELLKNOWN_ARTIFACT);
  if (seedId === "ghost-tracker") {
    const tracker = loadGhostTracker();
    const report = runDiff({
      wellKnown,
      tracker,
      expectedTrackerCount: null,
    });
    if ((report.trackerOnly ?? []).length === 0) {
      return envelope({
        ok: false,
        command: "seeded",
        error: failError("RUNTIME", "ghost-tracker fixture did not produce a tracker-only route"),
      });
    }
    return ghostTrackerEnvelope(report);
  }

  const tracker = loadTracker(parsed.flags.tracker || DEFAULT_TRACKER_ARTIFACT);
  const report = runDiff({ wellKnown, tracker });
  if (seedId === "claim-match") return claimMatchEnvelope(report);
  if (seedId === "absence-as-demand") return absenceAsDemandEnvelope(report);
  return runSeeded(seedId, parsed.flags);
}

async function runColdHarness() {
  const steps = [];
  const diffEnv = coldDiff({ flags: {} });
  steps.push({
    step: "cold-diff",
    ok: diffEnv.ok,
    exit: exitFor(diffEnv),
    wellKnownCount: diffEnv.result?.wellKnownCount,
    trackerCount: diffEnv.result?.trackerCount,
    wellKnownOnlyPathCount: diffEnv.result?.wellKnownOnlyPathCount,
    aligned: diffEnv.result?.aligned,
    catalogAbsenceIsDemand: diffEnv.result?.catalogAbsenceIsDemand,
  });

  const seeds = ["claim-match", "absence-as-demand", "ghost-tracker", "live", "payment-signature"];
  for (const id of seeds) {
    const env = seededFromDiff(id, { flags: {} });
    const ex = exitFor(env);
    steps.push({
      step: `seeded:${id}`,
      ok: env.ok,
      exit: ex,
      code: env.error?.code,
      refused: env.result?.refused === true,
      paymentSent: env.boundary?.paymentSent,
      liveFetch: env.boundary?.liveFetch,
    });
  }

  const diffOk = diffEnv.ok === true && exitFor(diffEnv) === 0 && diffEnv.result?.aligned === false;
  const seedsOk = steps
    .filter((s) => s.step.startsWith("seeded:"))
    .every((s) => s.ok === false && s.exit !== 0 && s.refused === true && s.paymentSent === false);

  return envelope({
    ok: diffOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error: diffOk && seedsOk
      ? null
      : failError("HARNESS_FAIL", "cold harness failed real-artifact diff or seeded refuse", { steps }),
    result: {
      diffOk,
      seedsOk,
      steps,
      compactPins: {
        wellknown: COMPACT_WELLKNOWN.slice(PACK_ROOT.length + 1),
        tracker: COMPACT_TRACKER.slice(PACK_ROOT.length + 1),
      },
      boundary: { paymentSent: false, liveFetch: false, cdpCalled: false },
    },
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.missing) {
    const env = envelope({
      ok: false,
      command: "unknown",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missing}`),
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = exitFor(env);
    return;
  }

  if (parsed.help || parsed.tokens[0] === "help") {
    process.stderr.write(usage());
    const env = envelope({ ok: true, command: "help" });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = 0;
    return;
  }

  let env;
  if (parsed.flags.live) {
    env = refuseLive();
  } else if (parsed.seededId) {
    env = seededFromDiff(parsed.seededId, parsed);
  } else if (parsed.flags.fixture) {
    const fix = loadOptionalJson(parsed.flags.fixture);
    if (!fix) {
      env = envelope({
        ok: false,
        command: "fixture",
        status: "usage",
        error: failError("USAGE", `fixture not found: ${parsed.flags.fixture}`),
      });
    } else {
      env = seededFromDiff(fix.seededId || fix.id, { flags: { ...parsed.flags, ...fix.opts } });
    }
  } else {
    const t0 = parsed.tokens[0];
    if (t0 === "run") env = await runColdHarness();
    else if (!t0 || t0 === "diff") env = coldDiff(parsed);
    else {
      process.stderr.write(usage());
      env = envelope({
        ok: false,
        command: t0,
        status: "usage",
        error: failError("USAGE", "expected diff | run | --seeded-failure <id>", {
          knownSeeds: Object.keys(SEEDED),
        }),
      });
    }
  }

  emitEnvelope(env, { pretty: parsed.pretty, human: true });
  process.exitCode = exitFor(env);
}

main().catch((e) => {
  const env = envelope({
    ok: false,
    command: "runtime",
    status: "error",
    error: failError("RUNTIME", e.message),
  });
  emitEnvelope(env);
  process.exitCode = exitFor(env);
});
