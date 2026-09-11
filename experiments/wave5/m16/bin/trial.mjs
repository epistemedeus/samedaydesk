#!/usr/bin/env node
import { parseArgs, usage } from "../lib/args.mjs";
import { TrialRefuse, TrialTransport } from "../lib/errors.mjs";
import { runCatalogBinding, runTrial } from "../lib/run-trial.mjs";

function emit(payload, code) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
}

function exitFor(report) {
  if (!report.ok && report.transport && report.transport.ok === false) return 1;
  if (report.refused || report.analysis?.outcome === "refused") return 2;
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (args.help || cmd === "help" || cmd === "--help") {
  process.stdout.write(usage());
  process.exit(0);
}

try {
  if (cmd === "catalog-binding") {
    emit(runCatalogBinding(), 0);
  }
  if (cmd !== "run") {
    emit({ ok: false, refused: true, code: "unknown-command", error: `unknown command ${cmd}` }, 2);
  }
  const report = await runTrial(args);
  emit(report, exitFor(report));
} catch (err) {
  if (err instanceof TrialRefuse) {
    emit(
      {
        ok: true,
        refused: true,
        transport: { ok: true, outcome: "ok" },
        analysis: { outcome: "refused", validRefusal: true, code: err.code },
        code: err.code,
        error: err.message,
        detail: err.detail,
        purchaseAuthority: false,
      },
      err.exitCode,
    );
  }
  if (err instanceof TrialTransport) {
    emit(
      {
        ok: false,
        refused: false,
        transport: { ok: false, outcome: err.code, code: err.code },
        analysis: { outcome: "not-run", validRefusal: false },
        code: err.code,
        error: err.message,
        detail: err.detail,
        purchaseAuthority: false,
      },
      err.exitCode,
    );
  }
  emit(
    {
      ok: false,
      refused: false,
      transport: { ok: false, outcome: "internal-error" },
      analysis: { outcome: "not-run" },
      code: "internal-error",
      error: String(err?.message || err),
      purchaseAuthority: false,
    },
    1,
  );
}
