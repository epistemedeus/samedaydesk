#!/usr/bin/env node
/**
 * SDS unpaid double-charge guard.
 * Boundary: tools/verify-sds/double-charge-guard/** only.
 * Loads published payment-attempt + fulfill engines with fixture Stripe.
 * Never Stripe/x402 spend, never POST /api/checkout, never mutate checkout.js.
 *
 * Usage:
 *   node tools/verify-sds/double-charge-guard/cli.mjs cold [--json]
 *   node tools/verify-sds/double-charge-guard/cli.mjs --seeded-failure second-charge [--json]
 *   node tools/verify-sds/double-charge-guard/cli.mjs run [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLD_CASES,
  FEATURE,
  FLAG_ERROR_CODES,
  FORBIDDEN_FLAGS,
  SEEDED,
} from "./lib/catalog.mjs";
import { citePublishedEngine } from "./lib/cite.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { runColdCases } from "./lib/guard.mjs";
import { loadPublishedEngine } from "./lib/load-engine.mjs";
import { refuseNeo, refusePublish, runSeeded } from "./lib/refuse.mjs";
import { resolveRoot } from "./lib/repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function usage() {
  return `sds double-charge-guard — unpaid PaymentIntent / fulfill proofs

Commands:
  cold                    run published engine against fixture Stripe (exit 0)
  run                     cold + seeded refuses (exit 0 iff cold pass and seeds refuse)
  cite                    hash + pattern cite of payment-attempt / fulfill / migration

Seeded failures (exit ≠ 0, clear code, paymentSent=false):
  --seeded-failure second-charge
  --seeded-failure retrieve-fail-recreate
  --seeded-failure changed-facts-bypass
  --seeded-failure live-stripe
  --seeded-failure checkout-path
  --seeded-failure payment-signature
  --seeded-failure neo

Options:
  --json / --pretty       JSON envelope on stdout
  --fixture PATH          load seeded fixture JSON

Never: --pay --checkout --live --publish --neo --stripe-key. Never api.stripe.com.
Engine: server/lib/payment-attempt.js + server/lib/fulfill.js (copied, unpaid stubs).
`;
}

function parseArgs(argv) {
  const out = {
    tokens: [],
    flags: {},
    seededId: null,
    help: false,
    pretty: false,
    forbidden: null,
    missing: null,
    fixture: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FORBIDDEN_FLAGS.includes(a) || FORBIDDEN_FLAGS.some((f) => a.startsWith(`${f}=`))) {
      out.forbidden = a;
      continue;
    }
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.flags.json = true;
    else if (a === "--pretty") out.pretty = true;
    else if (a === "--human") out.flags.human = true;
    else if (a === "--seeded-failure") {
      out.seededId = argv[++i];
      if (!out.seededId || String(out.seededId).startsWith("-")) {
        out.missing = "--seeded-failure";
        out.seededId = null;
      }
    } else if (a === "--fixture") {
      out.fixture = argv[++i];
      if (!out.fixture) out.missing = "--fixture";
    } else if (a === "--path") {
      out.flags.path = argv[++i];
    } else if (a === "--host") {
      out.flags.host = argv[++i];
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

function loadFixture(path, root) {
  const candidates = [];
  if (isAbsolute(path)) candidates.push(path);
  else {
    candidates.push(join(process.cwd(), path));
    candidates.push(join(root, path));
    candidates.push(join(here, path));
  }
  for (const full of candidates) {
    if (existsSync(full)) return JSON.parse(readFileSync(full, "utf8"));
  }
  return null;
}

function evidenceCite(cite, copies) {
  return [
    {
      kind: "engine-cite",
      files: cite.files,
      copies: copies || [],
      note: "published SDS engines; unpaid stubs for supabase/notify only",
    },
    {
      kind: "w0b2-cite",
      pr: 148,
      branch: "heavy/w0-b2-verify-sds",
      patterns: ["tools/verify/lib/envelope.mjs JSON envelope"],
      note: "cite-only; do not edit tools/verify/**",
    },
    {
      kind: "boundary",
      paymentSent: false,
      checkoutOpened: false,
      liveStripe: false,
      toolsCalled: false,
      neoPublished: false,
      published: false,
    },
  ];
}

async function runCold(root, engine) {
  const cite = citePublishedEngine(root);
  const proof = await runColdCases(engine);
  const evidence = evidenceCite(cite, engine.copies);
  evidence.push({
    kind: "cold-cases",
    ids: COLD_CASES,
    results: proof.cases,
  });

  if (!cite.ok) {
    return envelope({
      ok: false,
      command: "cold",
      feature: FEATURE,
      evidence,
      error: failError("ENGINE_CITE", "published engine patterns missing", {
        files: cite.files.filter((f) => !f.ok),
        missing: cite.missing,
      }),
    });
  }

  if (!proof.ok) {
    return envelope({
      ok: false,
      command: "cold",
      feature: FEATURE,
      evidence,
      error: failError("DOUBLE_CHARGE_GUARD_FAIL", "published engine failed an unpaid double-charge case", {
        failed: proof.failed,
      }),
      result: {
        caseCount: proof.caseCount,
        failed: proof.failed,
        cases: proof.cases,
        paymentSent: false,
        liveStripe: false,
        checkoutOpened: false,
      },
    });
  }

  return envelope({
    ok: true,
    command: "cold",
    feature: FEATURE,
    evidence,
    result: {
      caseCount: proof.caseCount,
      failedCount: 0,
      cases: proof.cases,
      engine: {
        create: "server/lib/payment-attempt.js#createOfferPaymentIntent",
        fulfill: "server/lib/fulfill.js#fulfillFromIntent",
        store: "server/lib/payment-attempt-store.js#createMemoryPaymentAttemptStore",
        migration: "supabase/migrations/0004_repeat_purchase_attempts.sql",
      },
      stripe: "fixture",
      paymentSent: false,
      liveStripe: false,
      checkoutOpened: false,
      copies: engine.copies,
    },
  });
}

async function runCite(root) {
  const cite = citePublishedEngine(root);
  return envelope({
    ok: cite.ok,
    command: "cite",
    feature: FEATURE,
    evidence: evidenceCite(cite),
    error: cite.ok
      ? null
      : failError("ENGINE_CITE", "published engine patterns missing", cite),
    result: {
      files: cite.files,
      paymentSent: false,
    },
  });
}

async function runHarness(root, engine) {
  const steps = [];
  const coldEnv = await runCold(root, engine);
  steps.push({
    step: "cold",
    ok: coldEnv.ok,
    exit: exitFor(coldEnv),
    caseCount: coldEnv.result?.caseCount,
  });

  const seeds = Object.keys(SEEDED);
  for (const id of seeds) {
    const env = await runSeeded(id, engine, { path: "/api/checkout" });
    steps.push({
      step: `seeded:${id}`,
      ok: env.ok,
      exit: exitFor(env),
      code: env.error?.code,
      refused: env.result?.refused === true,
      paymentSent: env.boundary?.paymentSent,
    });
  }

  const coldOk = coldEnv.ok === true && exitFor(coldEnv) === 0;
  const seedsOk = steps
    .filter((s) => s.step.startsWith("seeded:"))
    .every((s) => s.ok === false && s.exit !== 0 && s.refused === true && s.paymentSent === false);

  return envelope({
    ok: coldOk && seedsOk,
    command: "run",
    feature: FEATURE,
    evidence: [
      ...evidenceCite(citePublishedEngine(root), engine.copies),
      { kind: "harness-steps", steps },
    ],
    error:
      coldOk && seedsOk
        ? null
        : failError("HARNESS_FAIL", "cold harness failed engine proof or seeded refuse", { steps }),
    result: {
      coldOk,
      seedsOk,
      steps,
      cases: coldEnv.result?.cases,
      paymentSent: false,
      liveStripe: false,
      checkoutOpened: false,
    },
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const root = resolveRoot(process.cwd());

  if (parsed.forbidden) {
    const flagName = String(parsed.forbidden).split("=")[0];
    if (flagName === "--neo") {
      const env = refuseNeo();
      env.result = { ...env.result, flag: parsed.forbidden };
      emitEnvelope(env, { pretty: parsed.pretty });
      process.exitCode = exitFor(env);
      return;
    }
    if (flagName === "--publish") {
      const env = refusePublish();
      env.result = { ...env.result, flag: parsed.forbidden };
      emitEnvelope(env, { pretty: parsed.pretty });
      process.exitCode = exitFor(env);
      return;
    }
    const code = FLAG_ERROR_CODES[flagName] || "PAYMENT_FORBIDDEN";
    const env = envelope({
      ok: false,
      command: "unknown",
      status: "fail",
      error: failError(
        code,
        `forbidden flag in unpaid double-charge-guard: ${parsed.forbidden}`,
        { flag: parsed.forbidden, forbidden: [...FORBIDDEN_FLAGS] },
      ),
      result: { refused: true, paymentSent: false, flag: parsed.forbidden },
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = exitFor(env);
    return;
  }

  if (parsed.missing) {
    const env = envelope({
      ok: false,
      command: "unknown",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missing}`, {
        knownSeeds: Object.keys(SEEDED),
      }),
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = exitFor(env);
    return;
  }

  if (parsed.help || parsed.tokens[0] === "help") {
    process.stderr.write(usage());
    const env = envelope({ ok: true, command: "help", feature: FEATURE });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exitCode = 0;
    return;
  }

  let env;
  const needsEngine =
    parsed.seededId === "second-charge"
    || parsed.seededId === "retrieve-fail-recreate"
    || parsed.seededId === "changed-facts-bypass"
    || parsed.fixture
    || parsed.tokens[0] !== "cite";

  let engine = null;
  const command = parsed.seededId
    ? "seeded"
    : parsed.fixture
      ? "fixture"
      : parsed.tokens[0] || "cold";

  if (needsEngine && command !== "cite" && command !== "help") {
    engine = await loadPublishedEngine(root);
  }

  if (parsed.fixture) {
    const fix = loadFixture(parsed.fixture, root);
    if (!fix) {
      env = envelope({
        ok: false,
        command: "fixture",
        status: "usage",
        error: failError("USAGE", `fixture not found: ${parsed.fixture}`),
      });
    } else {
      const seedId = fix.seededId || fix.id;
      env = await runSeeded(seedId, engine, fix.opts || {});
    }
  } else if (parsed.seededId) {
    env = await runSeeded(parsed.seededId, engine, {
      path: parsed.flags.path,
      host: parsed.flags.host,
    });
  } else if (command === "cite") {
    env = await runCite(root);
  } else if (command === "run") {
    env = await runHarness(root, engine);
  } else if (command === "cold" || parsed.tokens.length === 0) {
    env = await runCold(root, engine);
  } else {
    env = envelope({
      ok: false,
      command,
      status: "usage",
      error: failError(
        "USAGE",
        "double-charge-guard cold | run | cite | --seeded-failure <id>",
        { knownSeeds: Object.keys(SEEDED) },
      ),
    });
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
