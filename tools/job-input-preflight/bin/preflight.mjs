#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, usage } from "../lib/args.mjs";
import { findJob, loadCatalog } from "../lib/catalog.mjs";
import { createNullEngineAdapter } from "../lib/engine-adapter.mjs";
import { preflight } from "../lib/preflight.mjs";
import { PreflightRefuse, resultFromRefuse } from "../lib/refuse.mjs";
import { DEFAULT_CATALOG } from "../lib/roots.mjs";

function emit(payload, exitCode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.control.help) {
    process.stdout.write(usage());
    return 0;
  }
  if (!parsed.jobId) {
    process.stderr.write(usage());
    emit(
      resultFromRefuse(
        new PreflightRefuse("missing-job", "preflight requires a job id (for example vendor-budget-impact)"),
      ),
      2,
    );
  }

  const catalogSource = parsed.control.catalog && parsed.control.catalog !== true
    ? parsed.control.catalog
    : DEFAULT_CATALOG;
  const catalog = await loadCatalog(catalogSource);
  const job = findJob(catalog, parsed.jobId);
  const engineAdapter = createNullEngineAdapter();

  const flags = { ...parsed.flags };
  const digestFlags = {};
  for (const [key, value] of Object.entries(parsed.control)) {
    if (key.endsWith("-digest") || key.endsWith("-sha256") || key.endsWith("-bytes")) {
      digestFlags[key] = value;
    }
  }

  const inputRoot = parsed.control["input-root"] && parsed.control["input-root"] !== true
    ? parsed.control["input-root"]
    : null;
  const declaredInputs = parsed.control["declared-inputs"] && parsed.control["declared-inputs"] !== true
    ? parsed.control["declared-inputs"]
    : null;
  const outDir = parsed.control["out-dir"] && parsed.control["out-dir"] !== true
    ? parsed.control["out-dir"]
    : null;

  const result = preflight({
    catalog,
    job,
    flags: { ...flags, ...digestFlags },
    inputRoot,
    declaredInputs,
    outDir,
    example: parsed.control.example === true,
    engineAdapter,
  });

  if (engineAdapter.calls.length !== 0) {
    throw new Error("internal: engine adapter was invoked");
  }
  emit(result, 0);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((err) => {
    if (err instanceof PreflightRefuse) emit(resultFromRefuse(err), err.exitCode);
    emit(
      {
        ok: false,
        refused: true,
        code: "internal-error",
        error: String(err?.message || err),
        engineInvoked: false,
        purchaseAuthority: false,
        spendClaim: false,
        toolCostClaim: false,
      },
      1,
    );
  });
}
