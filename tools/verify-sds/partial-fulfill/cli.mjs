#!/usr/bin/env node
/**
 * SDS partial-fulfill refuse-settle verifier.
 * Boundary: tools/verify-sds/partial-fulfill/** only.
 * Never Stripe/x402 spend, never PAYMENT-SIGNATURE, never live settlement-proof.
 *
 * Usage:
 *   node tools/verify-sds/partial-fulfill/cli.mjs refuse-settle [--json]
 *   node tools/verify-sds/partial-fulfill/cli.mjs inspect --fixture PATH [--json]
 *   node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure settle-partial [--json]
 *   node tools/verify-sds/partial-fulfill/cli.mjs run [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COMPLETE_ARTIFACT,
  DEFAULT_PARTIAL_ARTIFACT,
  FEATURE,
  SEEDED,
  SETTLEMENT_PROOF_CITE,
} from "./lib/catalog.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { inspectFulfillment, assertOffline, assertNotPaymentPath } from "./lib/settle.mjs";
import { runSeeded } from "./lib/refuse.mjs";
import { REPO_ROOT } from "./lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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
    } else if (a === "--fixture") {
      out.flags.fixture = argv[++i];
    } else if (a === "--origin") {
      out.flags.origin = argv[++i];
    } else if (a === "--live") {
      out.flags.live = true;
    } else if (a.startsWith("--")) {
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
  return `sds partial-fulfill — refuse settle when SDS fulfillment is partial

Commands:
  refuse-settle           cold gate on committed partial extract-batch (default)
  inspect [--fixture P]   classify + settle decision (never pays)
  settle ...              always refuse (PARTIAL_FULFILL or UNPAID_BOUNDARY)
  run                     cold harness: refuse-settle exit 0 + seeded refuses
  cite-apex               document live settlement-proof URL (read-only; no fetch)

Seeded failures (exit ≠ 0, settled=false, paymentSent=false):
  --seeded-failure settle-partial
  --seeded-failure forged-complete
  --seeded-failure silent-ok-partial
  --seeded-failure receipt-on-partial
  --seeded-failure payment-signature
  --seeded-failure stripe-path
  --seeded-failure live

Options:
  --fixture PATH          fulfillment JSON (default: ${DEFAULT_PARTIAL_ARTIFACT})
  --json / --pretty       JSON envelope on stdout
  --live / --origin URL   refused (this pack is offline)

Never send: PAYMENT-SIGNATURE, X-PAYMENT, stripe-signature
Never POST: /api/checkout, /extract/batch, ${SETTLEMENT_PROOF_CITE}
`;
}

function resolveFixture(path) {
  if (!path) return null;
  if (isAbsolute(path) && existsSync(path)) return path;
  const fromCwd = join(process.cwd(), path);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRepo = join(REPO_ROOT, path);
  if (existsSync(fromRepo)) return fromRepo;
  const fromPack = join(here, path);
  if (existsSync(fromPack)) return fromPack;
  return null;
}

function loadFulfillment(path) {
  const full = resolveFixture(path);
  if (!full) {
    const err = new Error(`fixture not found: ${path}`);
    err.code = "USAGE";
    throw err;
  }
  return { path: relPath(full), data: JSON.parse(readFileSync(full, "utf8")) };
}

function relPath(full) {
  const root = REPO_ROOT.endsWith("/") ? REPO_ROOT : `${REPO_ROOT}/`;
  if (full.startsWith(root)) return full.slice(root.length);
  return full;
}

function inspectEnvelope({ fixturePath, command }) {
  const loaded = loadFulfillment(fixturePath);
  const { classification, settle } = inspectFulfillment(loaded.data);
  const refusedSettle = settle.decision === "refuse";
  const ok = settle.settled === false && settle.paymentSent === false;
  if (!ok) {
    return envelope({
      ok: false,
      command,
      feature: FEATURE,
      error: failError("SETTLE_PARTIAL", "settle gate failed closed", { settle, classification }),
    });
  }
  return envelope({
    ok: true,
    command,
    feature: FEATURE,
    evidence: [
      {
        kind: "artifact",
        path: loaded.path,
        product: classification.product || classification.kind,
        fulfillmentKind: classification.kind,
      },
      {
        kind: "fulfillment",
        partial: classification.partial,
        complete: classification.complete,
        reasons: classification.reasons,
      },
      {
        kind: "settle",
        decision: settle.decision,
        code: settle.code,
        settled: false,
        paymentSent: false,
      },
    ],
    result: {
      fixture: loaded.path,
      kind: classification.kind,
      product: classification.product || null,
      partial: classification.partial,
      complete: classification.complete,
      reasons: classification.reasons,
      settleDecision: settle.decision,
      settleCode: settle.code,
      refusedSettle,
      settled: false,
      paymentSent: false,
      sourceCount: classification.sourceCount,
      failedSources: classification.failedSources,
      accounting: classification.accounting,
      claimsComplete: classification.claimsComplete,
      jobId: classification.jobId || null,
      jobStatus: classification.jobStatus || null,
    },
  });
}

function refuseSettleEnvelope(fixturePath = DEFAULT_PARTIAL_ARTIFACT) {
  const env = inspectEnvelope({ fixturePath, command: "refuse-settle" });
  if (!env.ok) return env;
  if (env.result.partial !== true || env.result.settleDecision !== "refuse") {
    return envelope({
      ok: false,
      command: "refuse-settle",
      feature: FEATURE,
      error: failError(
        "HARNESS_FAIL",
        "expected partial fulfillment to refuse settle",
        { fixture: env.result.fixture, settleDecision: env.result.settleDecision, partial: env.result.partial },
      ),
      result: env.result,
    });
  }
  return env;
}

function settleAttemptEnvelope(fixturePath) {
  const loaded = loadFulfillment(fixturePath || DEFAULT_PARTIAL_ARTIFACT);
  const { classification, settle } = inspectFulfillment(loaded.data);
  const code = classification.partial ? "PARTIAL_FULFILL" : "UNPAID_BOUNDARY";
  return envelope({
    ok: false,
    command: "settle",
    feature: FEATURE,
    error: failError(
      code,
      classification.partial
        ? "refusing settle: fulfillment is partial"
        : "refusing settle: this pack never pays, even on complete fulfillment",
      { fixture: loaded.path, decision: settle.decision },
    ),
    result: {
      refused: true,
      settled: false,
      paymentSent: false,
      fixture: loaded.path,
      partial: classification.partial,
      settleDecision: settle.decision,
      settleCode: settle.code,
    },
  });
}

async function runColdHarness() {
  const steps = [];
  const refuseEnv = refuseSettleEnvelope(DEFAULT_PARTIAL_ARTIFACT);
  steps.push({
    step: "refuse-settle",
    ok: refuseEnv.ok,
    exit: exitFor(refuseEnv),
    settleDecision: refuseEnv.result?.settleDecision,
    partial: refuseEnv.result?.partial,
  });

  const completeEnv = inspectEnvelope({
    fixturePath: DEFAULT_COMPLETE_ARTIFACT,
    command: "inspect",
  });
  steps.push({
    step: "inspect-complete",
    ok: completeEnv.ok,
    exit: exitFor(completeEnv),
    settleDecision: completeEnv.result?.settleDecision,
    complete: completeEnv.result?.complete,
    settled: completeEnv.result?.settled,
  });

  const seeds = Object.keys(SEEDED);
  for (const id of seeds) {
    const env = runSeeded(id);
    const ex = exitFor(env);
    steps.push({
      step: `seeded:${id}`,
      ok: env.ok,
      exit: ex,
      code: env.error?.code,
      refused: env.result?.refused === true,
      paymentSent: env.boundary?.paymentSent,
      settled: env.boundary?.settled,
    });
  }

  const refuseOk = refuseEnv.ok === true && exitFor(refuseEnv) === 0 && refuseEnv.result?.refusedSettle === true;
  const completeOk =
    completeEnv.ok === true &&
    completeEnv.result?.complete === true &&
    completeEnv.result?.settled === false &&
    completeEnv.result?.settleDecision === "eligible-unpaid";
  const seedsOk = steps
    .filter((s) => s.step.startsWith("seeded:"))
    .every(
      (s) =>
        s.ok === false &&
        s.exit !== 0 &&
        s.refused === true &&
        s.paymentSent === false &&
        s.settled === false,
    );

  return envelope({
    ok: refuseOk && completeOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [{ kind: "harness-steps", steps }],
    error:
      refuseOk && completeOk && seedsOk
        ? null
        : failError("HARNESS_FAIL", "cold harness failed refuse-settle, complete inspect, or seeded refuse", { steps }),
    result: {
      refuseOk,
      completeOk,
      seedsOk,
      steps,
      boundary: { paymentSent: false, settled: false, liveFetch: false },
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

  if (parsed.flags.live || parsed.flags.origin) {
    try {
      if (parsed.flags.live) {
        assertOffline(SETTLEMENT_PROOF_CITE);
      }
      if (parsed.flags.origin) {
        assertOffline(parsed.flags.origin);
        assertNotPaymentPath(parsed.flags.origin);
      }
    } catch (e) {
      env = envelope({
        ok: false,
        command: parsed.tokens[0] || "seeded",
        feature: FEATURE,
        status: e.code === "LIVE_REFUSE" ? "usage" : "fail",
        error: failError(e.code || "LIVE_REFUSE", e.message, e.detail),
        result: { refused: true, liveFetch: false, paymentSent: false, settled: false },
      });
      emitEnvelope(env, { pretty: parsed.pretty, human: true });
      process.exitCode = exitFor(env);
      return;
    }
  }

  if (parsed.flags.fixture && !parsed.seededId && !parsed.tokens[0]) {
    const seededFix = resolveFixture(parsed.flags.fixture);
    if (seededFix) {
      try {
        const doc = JSON.parse(readFileSync(seededFix, "utf8"));
        if (doc && doc.seededId) {
          env = runSeeded(doc.seededId, {
            header: doc.header || parsed.flags.header,
            path: parsed.flags.path,
          });
          emitEnvelope(env, { pretty: parsed.pretty, human: true });
          process.exitCode = exitFor(env);
          return;
        }
      } catch {
        /* fall through to fulfillment inspect */
      }
    }
  }

  if (parsed.seededId) {
    env = runSeeded(parsed.seededId, {
      header: parsed.flags.header,
      path: parsed.flags.path,
    });
  } else {
    const t0 = parsed.tokens[0];
    if (t0 === "run") {
      env = await runColdHarness();
    } else if (!t0) {
      env = refuseSettleEnvelope(parsed.flags.fixture || DEFAULT_PARTIAL_ARTIFACT);
    } else if (t0 === "refuse-settle" || t0 === "refuse") {
      env = refuseSettleEnvelope(parsed.flags.fixture || DEFAULT_PARTIAL_ARTIFACT);
    } else if (t0 === "inspect") {
      env = inspectEnvelope({
        fixturePath: parsed.flags.fixture || DEFAULT_PARTIAL_ARTIFACT,
        command: "inspect",
      });
    } else if (t0 === "settle") {
      env = settleAttemptEnvelope(parsed.flags.fixture);
    } else if (t0 === "cite-apex" || t0 === "cite") {
      env = envelope({
        ok: true,
        command: "cite-apex",
        feature: FEATURE,
        result: {
          url: SETTLEMENT_PROOF_CITE,
          note: "Live settlement-proof cited read-only. Cold proof uses committed result-reuse fixtures. Never POST payment or fetch this URL.",
          toolsCalled: false,
          paymentSent: false,
          settled: false,
        },
      });
    } else {
      env = envelope({
        ok: false,
        command: t0,
        status: "usage",
        error: failError("USAGE", "partial-fulfill refuse-settle | inspect | run | --seeded-failure <id>", {
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
    error: failError(e.code || "RUNTIME", e.message, e.detail),
  });
  emitEnvelope(env);
  process.exitCode = exitFor(env);
});
