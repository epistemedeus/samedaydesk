#!/usr/bin/env node
/**
 * One cold unpaid verification journey.
 *
 * Finds this clone from this file, not from process.cwd(). Calls the
 * existing 402 matrix, absence corpus, bazaar-drift receipt, and the
 * maintained useful-jobs discovery client. Then executes the tagged command
 * fences in howto-unpaid-mcp.md. Does not pay, sign, check out, publish, or
 * scan a live catalog. Historical catalog files stay dated fixtures.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = realpathSync(resolve(here, "../.."));
const howtoPath = resolve(here, "howto-unpaid-mcp.md");
const nodeBin = process.execPath;

const REFUSED = new Set([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "rematerialize",
  "neo",
  "neo-kernel-vendor",
]);

const FENCE_RE =
  /<!--\s*unpaid-cold:(step|seeded-failure)\s+id=([A-Za-z0-9_-]+)\s*-->\s*```(?:bash|sh)?\n([\s\S]*?)```/g;

function emit(value, status) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(status);
}

function parseArgs(argv) {
  const out = { help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (REFUSED.has(name)) {
        const err = new Error(`${arg} is refused. This journey is unpaid fixture verification only.`);
        err.code = "REFUSED";
        throw err;
      }
      const err = new Error(`unknown argument ${arg}`);
      err.code = "USAGE";
      throw err;
    } else {
      const err = new Error(`unexpected argument ${arg}`);
      err.code = "USAGE";
      throw err;
    }
  }
  return out;
}

function run(args, { cwd = repoRoot, env } = {}) {
  const proc = spawnSync(nodeBin, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: proc.status ?? 1,
    stdout: proc.stdout || "",
    stderr: proc.stderr || "",
    error: proc.error ? proc.error.message : null,
  };
}

function runBash(script) {
  const proc = spawnSync("bash", ["-c", script], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: proc.status ?? 1,
    stdout: proc.stdout || "",
    stderr: proc.stderr || "",
    error: proc.error ? proc.error.message : null,
  };
}

function parseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function loadFences() {
  const md = readFileSync(howtoPath, "utf8");
  const fences = [];
  const re = new RegExp(FENCE_RE.source, "g");
  let match;
  while ((match = re.exec(md))) {
    fences.push({ kind: match[1], id: match[2], script: match[3].replace(/\s+$/, "") });
  }
  return fences;
}

function locate(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  const abs = isAbsolute(input) ? input : resolve(repoRoot, input);
  if (!existsSync(abs)) {
    return { ok: false, input, absolute: abs, repoRelative: null };
  }
  const real = realpathSync(abs);
  const rel = relative(repoRoot, real);
  const inside = rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  return {
    ok: inside,
    input,
    absolute: real,
    repoRelative: inside ? rel : null,
  };
}

function pushPath(bucket, id, input) {
  const located = locate(input);
  if (!located) return;
  bucket.push({ id, ...located });
}

function check(id, ok, extra = {}) {
  return { id, ok: Boolean(ok), ...extra };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    emit(
      {
        ok: false,
        paid: false,
        liveCatalogScan: false,
        paymentSent: false,
        error: { code: error.code || "USAGE", message: error.message },
      },
      2,
    );
  }
  if (args.help) {
    process.stdout.write(`Cold unpaid SDS verification (no install, no payment, no live catalog scan).

  node docs/agent-sds/unpaid-cold.mjs

Resolves the clone from this file, so the working directory may differ.
Exit 0 when the 402 contract, unknown-versus-zero corpus, dated catalog
drift, committed useful-jobs discovery, and the howto fences agree.
--live/--pay and unknown arguments exit 2.
`);
    process.exit(0);
  }

  const callerCwd = process.cwd();
  const exportedPaths = [];
  const checks = [];

  const discovery = run([
    "packs/e4-maintained-runtime-discovery/bin/discover.mjs",
    "--committed",
    "--compact",
  ]);
  const discoveryBody = parseJson(discovery.stdout);
  checks.push(
    check("useful-jobs-discovery", discovery.status === 0 && discoveryBody?.ok === true && discoveryBody?.mode === "committed", {
      exit: discovery.status,
      expectedExit: 0,
      entrypoint: "packs/e4-maintained-runtime-discovery/bin/discover.mjs",
      duplicated: false,
      package: discoveryBody?.offer?.package ?? null,
      version: discoveryBody?.offer?.version ?? null,
      client: discoveryBody?.client ?? null,
    }),
  );
  for (const surface of Object.values(discoveryBody?.surfaces || {})) {
    if (surface?.path) pushPath(exportedPaths, "discovery-surface", surface.path);
  }

  const matrix = run(["tools/verify-sds/w821-402-matrix/cli.mjs", "--cold"]);
  const matrixBody = parseJson(matrix.stdout);
  checks.push(
    check("402-matrix", matrix.status === 0 && matrixBody?.ok === true && matrixBody?.boundary?.paymentSent === false && matrixBody?.boundary?.live === false, {
      exit: matrix.status,
      expectedExit: 0,
      failed: matrixBody?.failed ?? null,
      total: matrixBody?.total ?? null,
      catalogRole: matrixBody?.crossCheck?.catalogRole ?? null,
      liveServiceClaim: matrixBody?.crossCheck?.liveServiceClaim ?? null,
      lastUpdated: matrixBody?.crossCheck?.lastUpdated ?? null,
    }),
  );
  pushPath(exportedPaths, "x402-catalog", matrixBody?.crossCheck?.catalogPath);
  for (const row of matrixBody?.results || []) pushPath(exportedPaths, "402-fixture", row.file);

  const forged = run(["tools/verify-sds/w821-402-matrix/cli.mjs", "--seeded-failure", "forged-settle"]);
  const forgedBody = parseJson(forged.stdout);
  const forgedCodes = forgedBody?.result?.codes || [];
  checks.push(
    check(
      "forged-settle",
      forged.status === 1 &&
        forgedBody?.error?.code === "SEED_REJECT" &&
        forgedCodes.includes("forged_settle") &&
        forgedBody?.result?.naiveVerdict === "accept" &&
        forgedBody?.result?.honestVerdict === "reject",
      {
        exit: forged.status,
        expectedExit: 1,
        code: forgedBody?.error?.code ?? null,
        caught: forgedBody?.result?.caught ?? null,
        file: forgedBody?.result?.file ?? null,
      },
    ),
  );
  pushPath(exportedPaths, "forged-settle", forgedBody?.result?.file);

  const absence = run(["tests/regression-sds/w822-absence/run.mjs", "--json"]);
  const absenceBody = parseJson(absence.stdout);
  const rows = absenceBody?.result?.rows || [];
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  const unknown = byId["missing-metrics-not-zero-honest"];
  const observedZero = byId["observed-zero-not-unknown"];
  const unknownAsZero = byId["unknown-stored-as-zero"];
  const distinct =
    unknown?.pass === true &&
    unknown?.observationClass === "unknown" &&
    unknown?.reject === false &&
    observedZero?.pass === true &&
    observedZero?.observationClass === "observed_zero" &&
    observedZero?.reject === false &&
    unknownAsZero?.pass === true &&
    unknownAsZero?.reject === true &&
    unknownAsZero?.observationClass === "unknown_as_zero" &&
    unknown.observationClass !== observedZero.observationClass;
  checks.push(
    check("absence", absence.status === 0 && absenceBody?.ok === true && distinct, {
      exit: absence.status,
      expectedExit: 0,
      passed: absenceBody?.result?.passed ?? null,
      failed: absenceBody?.result?.failed ?? null,
      total: absenceBody?.result?.total ?? null,
      acceptControls: rows.filter((row) => row.expect === "accept" && row.pass).length,
    }),
  );

  const absenceSeed = run(["tests/regression-sds/w822-absence/run.mjs", "--seeded-failure", "--json"]);
  const absenceSeedBody = parseJson(absenceSeed.stdout);
  checks.push(
    check("absence-seed", absenceSeed.status === 1 && absenceSeedBody?.error?.code === "SEED_REJECT", {
      exit: absenceSeed.status,
      expectedExit: 1,
      code: absenceSeedBody?.error?.code ?? null,
    }),
  );

  const drift = run(["tools/commerce-receipts/bazaar-drift/cli.mjs", "--cold"]);
  const driftBody = parseJson(drift.stdout);
  const read = (driftBody?.priceConflicts || []).find((row) => row.route === "/read");
  checks.push(
    check(
      "bazaar-drift",
      drift.status === 0 &&
        driftBody?.ok === true &&
        driftBody?.paid === false &&
        driftBody?.decision === "hold" &&
        driftBody?.code === "bazaar_price_conflict" &&
        read?.originAmount === "0.005" &&
        read?.bazaarAmount === "0.05" &&
        driftBody?.rematerialized === false,
      {
        exit: drift.status,
        expectedExit: 0,
        code: driftBody?.code ?? null,
        paid: driftBody?.paid ?? null,
        originAmount: read?.originAmount ?? null,
        bazaarAmount: read?.bazaarAmount ?? null,
        observedAt: driftBody?.observedAt ?? null,
        originObservedAt: driftBody?.originObservedAt ?? null,
        bazaarObservedAt: driftBody?.bazaarObservedAt ?? null,
        openapiVersion: driftBody?.openapiVersion ?? null,
      },
    ),
  );
  for (const [id, value] of Object.entries(driftBody?.artifacts || {})) {
    if (typeof value === "string") pushPath(exportedPaths, `bazaar-${id}`, value);
  }

  const driftSeed = run([
    "tools/commerce-receipts/bazaar-drift/cli.mjs",
    "--seeded-failure",
    "read-claimed-match",
  ]);
  const driftSeedBody = parseJson(driftSeed.stdout);
  checks.push(
    check(
      "bazaar-seed",
      driftSeed.status === 1 &&
        driftSeedBody?.error?.code === "SEED_REJECT" &&
        (driftSeedBody?.result?.codes || []).includes("rematerialized_claim"),
      {
        exit: driftSeed.status,
        expectedExit: 1,
        code: driftSeedBody?.error?.code ?? null,
        file: driftSeedBody?.result?.file ?? null,
      },
    ),
  );
  pushPath(exportedPaths, "bazaar-seed", driftSeedBody?.result?.file);

  const fences = loadFences();
  const loopback = fences.find((item) => item.id === "mcp-loopback");
  const paidSeed = fences.find((item) => item.id === "paid-tool-call");
  const loopProc = loopback ? runBash(loopback.script) : { status: 1, stdout: "", stderr: "missing fence" };
  const loopBody = parseJson(loopProc.stdout);
  checks.push(
    check(
      "howto-loopback",
      Boolean(loopback) &&
        loopProc.status === 0 &&
        loopBody?.ok === true &&
        loopBody?.paid === false &&
        loopBody?.toolsCalled === false &&
        loopBody?.paidToolCalled === false &&
        loopBody?.loopbackCallRefused === true &&
        loopBody?.protocolVersion === "2024-11-05",
      {
        exit: loopProc.status,
        expectedExit: 0,
        paidToolCalled: loopBody?.paidToolCalled ?? null,
        loopbackCallRefused: loopBody?.loopbackCallRefused ?? null,
      },
    ),
  );

  const seedProc = paidSeed ? runBash(paidSeed.script) : { status: 1, stdout: "", stderr: "missing fence" };
  const seedBody = parseJson(seedProc.stdout);
  checks.push(
    check(
      "howto-paid-refuse",
      Boolean(paidSeed) &&
        seedBody?.ok === false &&
        seedBody?.code === "PAID_REFUSE" &&
        seedBody?.neverPostedCall === true &&
        seedBody?.networkCalls === 0 &&
        seedBody?.paymentAttempted === false &&
        seedProc.stdout.includes("seeded_exit:1"),
      {
        exit: seedProc.status,
        expectedExit: 0,
        nodeExit: 1,
        code: seedBody?.code ?? null,
        neverPostedCall: seedBody?.neverPostedCall ?? null,
      },
    ),
  );

  pushPath(exportedPaths, "howto", "docs/agent-sds/howto-unpaid-mcp.md");
  const pathsOk = exportedPaths.length > 0 && exportedPaths.every((item) => item.ok);
  const callerOutside = relative(repoRoot, callerCwd).startsWith("..") || relative(repoRoot, callerCwd) === "..";
  const pathsIgnoreCaller =
    !callerOutside ||
    exportedPaths.every((item) => item.absolute && !item.absolute.startsWith(callerCwd.endsWith(sep) ? callerCwd : `${callerCwd}${sep}`));

  const ok = checks.every((item) => item.ok) && pathsOk && pathsIgnoreCaller;
  emit(
    {
      ok,
      paid: false,
      paymentSent: false,
      liveCatalogScan: false,
      callerCwd,
      repoRoot,
      catalog: {
        role: "dated-fixture",
        liveServiceClaim: false,
        x402LastUpdated: matrixBody?.crossCheck?.lastUpdated ?? null,
        x402Path: matrixBody?.crossCheck?.catalogPath ?? null,
        originOpenapi: driftBody?.openapiVersion ?? null,
        originObservedAt: driftBody?.originObservedAt ?? null,
        bazaarObservedAt: driftBody?.bazaarObservedAt ?? null,
        readOriginAmount: read?.originAmount ?? null,
        readBazaarAmount: read?.bazaarAmount ?? null,
      },
      discovery: {
        entrypoint: "packs/e4-maintained-runtime-discovery/bin/discover.mjs",
        mode: "committed",
        duplicated: false,
        package: discoveryBody?.offer?.package ?? null,
        version: discoveryBody?.offer?.version ?? null,
      },
      unknownVersusZero: {
        distinct,
        unknownId: "missing-metrics-not-zero-honest",
        unknownClass: unknown?.observationClass ?? null,
        observedZeroId: "observed-zero-not-unknown",
        observedZeroClass: observedZero?.observationClass ?? null,
        unknownStoredAsZeroId: "unknown-stored-as-zero",
        unknownStoredAsZeroClass: unknownAsZero?.observationClass ?? null,
        unknownStoredAsZeroRejected: unknownAsZero?.reject === true,
      },
      forgedSettlement: {
        caught: forgedBody?.result?.caught === true,
        code: forgedCodes.includes("forged_settle") ? "forged_settle" : null,
        exit: forged.status,
      },
      checks,
      exportedPaths,
      boundary: {
        paymentSent: false,
        checkout: false,
        publish: false,
        liveCatalogScan: false,
      },
    },
    ok ? 0 : 1,
  );
}

main();
