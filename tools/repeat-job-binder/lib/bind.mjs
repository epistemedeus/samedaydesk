import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { refuse } from "./refuse.mjs";
import { SUPPORTED_FAMILIES } from "./pins.mjs";
import { extractPinnedKits } from "./extract.mjs";
import { createAdapters, runEngine } from "./engines.mjs";
import { loadTicket } from "./ticket.mjs";
import { mergeDeclared, refuseCron, refuseLiveSample, resolveInputs, verifyInputs } from "./verify.mjs";
import { buildSecondRun, writeSecondRun } from "./second-run.mjs";

const OUTPUTS = ["second-run.json", "second-run.md"];

function realpathOrAbs(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function resolveOutDir(args, sourcePaths) {
  const sources = (sourcePaths || []).filter(Boolean).map((p) => realpathOrAbs(String(p)));
  const sourceSet = new Set(sources);
  let outDir;
  if (args["out-dir"]) outDir = path.resolve(String(args["out-dir"]));
  else {
    outDir = path.join(
      process.cwd(),
      "out",
      "repeat-job-binder",
      `run-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    );
  }
  if (sourceSet.has(realpathOrAbs(outDir)) || sources.some((s) => outDir === s || outDir.startsWith(`${s}${path.sep}`))) {
    throw refuse("out-dir-collides-with-input", "Output directory collides with a source input path", {
      outDir,
      sources,
    });
  }
  for (const name of OUTPUTS) {
    const target = path.resolve(path.join(outDir, name));
    if (sourceSet.has(realpathOrAbs(target))) {
      throw refuse("output-collides-with-input", `Output file would overwrite a source input: ${name}`, {
        target,
      });
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function engineKindOf(args) {
  const k = args.engine == null || args.engine === true ? "catalog" : String(args.engine);
  if (k !== "catalog" && k !== "vendor-pin") {
    throw refuse("unknown-engine", "engine must be catalog or vendor-pin", { engine: k });
  }
  return k;
}

export async function bind(args, injectedAdapters = null) {
  refuseCron(args);
  const ticket = loadTicket(args.ticket);
  refuseLiveSample(args, ticket);

  const family = ticket.family;
  const spec = SUPPORTED_FAMILIES[family];
  const engineKind = engineKindOf(args);
  const inputs = resolveInputs(args, ticket);
  const declared = mergeDeclared(args, ticket);

  if (spec.requiredSlots.includes("used") && engineKind === "catalog" && !inputs.used && !declared.used) {
    // missing used stays informational, same as missing files
  }

  const verification = verifyInputs(inputs, declared, { family });
  if (verification.state === "mismatch") {
    throw refuse("input-digest-mismatch", "Declared currentInputs digests do not match local file bytes", {
      mismatches: verification.mismatches,
    });
  }

  const sourcePaths = [ticket.path, inputs.before, inputs.after, inputs.used, args["input-root"]].filter(Boolean);
  const outDir = resolveOutDir(args, sourcePaths);

  const afterActual = verification.verifiedInputs.after?.actual?.sha256 || null;
  let status;
  if (verification.state === "verified") {
    if (!afterActual) {
      throw refuse("missing-after", "Verified second use requires an after file");
    }
    if (ticket.firstAfterSha256 && afterActual === ticket.firstAfterSha256) {
      throw refuse(
        "after-digest-unchanged",
        "Second use requires a changed after file whose new sha256 is declared",
        { afterSha256: afterActual },
      );
    }
    if (!declared.after?.sha256) {
      throw refuse(
        "missing-declared-after-sha256",
        "Changed after file must declare its new sha256 (--declare-after-sha256 or ticket currentInputs)",
      );
    }
    status = "actionable";
  } else {
    status = "informational";
  }

  let engineResult = null;
  if (status === "actionable") {
    const adapters =
      injectedAdapters ||
      createAdapters(
        extractPinnedKits({
          usefulJobsRoot: args["useful-jobs-root"] || process.env.USEFUL_JOBS_ROOT || null,
          recordRepeatBin: args["record-repeat-bin"] || process.env.RECORD_REPEAT_BIN || null,
        }),
      );
    engineResult = await runEngine(adapters, engineKind, { family, inputs, outDir });
  }

  const record = buildSecondRun({
    ticket,
    verification,
    engineResult,
    status,
    family,
    outDir,
    engineKind,
    catalogJob: spec.catalogJob,
  });
  const written = writeSecondRun(outDir, record);
  return {
    ok: true,
    refused: false,
    status,
    family,
    engineKind,
    termsVersion: record.termsVersion,
    digest: record.digest,
    distinctFromFirst: record.distinctFromFirst,
    identityVerified: record.identityVerification.verified,
    outDir,
    outputs: written,
    schedulerDaemon: false,
    settling: false,
    purchaseAuthority: false,
    paidValueClaim: false,
    record,
  };
}

export async function bindMain(args) {
  const result = await bind(args);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      status: result.status,
      family: result.family,
      engineKind: result.engineKind,
      termsVersion: result.termsVersion,
      digest: result.digest,
      distinctFromFirst: result.distinctFromFirst,
      identityVerified: result.identityVerified,
      outDir: result.outDir,
      schedulerDaemon: false,
      settling: false,
      purchaseAuthority: false,
    })}\n`,
  );
  return result;
}
