import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CliRefuse, cliRefuse, parseArgs, usage } from "./args.mjs";
import { FIXTURES_ROOT, OUTPUT_JSON, OUTPUT_MD, SCHEMA, SCHEMA_VERSION } from "./paths.mjs";
import { parseJsonDocument, parseUsedSpec, readTextFile, sha256Prefixed, assertComparableKind, detectDocumentKind } from "./parse.mjs";
import { getAtPointer } from "./pointer.mjs";
import { classifyPair, fingerprintUsedNode } from "./compare.mjs";
import { attachTermsVersion, buildTermsBody, summarize, toMarkdown } from "./brief.mjs";
import { createHashTermsAdapter } from "./hash-adapter.mjs";

function examplePaths() {
  return {
    before: path.join(FIXTURES_ROOT, "example", "before.json"),
    after: path.join(FIXTURES_ROOT, "example", "after.json"),
    used: path.join(FIXTURES_ROOT, "example", "used.json"),
  };
}

function digestMeta(filePath, buf) {
  return {
    path: path.resolve(filePath),
    bytes: buf.length,
    sha256: sha256Prefixed(buf),
  };
}

function emptyImpact() {
  return {
    breaking: [],
    added: [],
    deleted: [],
    unchanged: [],
    informational: [],
    unknown: [],
    ignoredUnused: true,
  };
}

export function compareDocuments({ beforeDoc, afterDoc, usedSpec, kind }) {
  const impact = emptyImpact();
  const uncertainties = [...(usedSpec.uncertainties || [])];
  const remoteRefs = [];

  for (const pointer of usedSpec.pointers) {
    const beforeHit = getAtPointer(beforeDoc, pointer);
    const afterHit = getAtPointer(afterDoc, pointer);
    if (beforeHit.invalid || afterHit.invalid) {
      impact.unknown.push({
        pointer,
        reason: "invalid-json-pointer",
        class: "unknown",
      });
      uncertainties.push({ code: "invalid-json-pointer", pointer });
      continue;
    }
    const beforeFp = beforeHit.present
      ? fingerprintUsedNode(beforeHit.value, beforeDoc, kind)
      : { kind: "absent" };
    const afterFp = afterHit.present
      ? fingerprintUsedNode(afterHit.value, afterDoc, kind)
      : { kind: "absent" };
    const classified = classifyPair(beforeFp, afterFp);
    const row = {
      pointer,
      class: classified.class,
      reason: classified.reason,
      before: beforeFp,
      after: afterFp,
    };
    if (classified.class === "remote-ref") {
      remoteRefs.push(row);
      continue;
    }
    if (classified.class === "breaking") impact.breaking.push(row);
    else if (classified.class === "added") impact.added.push(row);
    else if (classified.class === "deleted") impact.deleted.push(row);
    else if (classified.class === "unchanged") impact.unchanged.push(row);
    else if (classified.class === "informational") impact.informational.push(row);
    else impact.unknown.push(row);
  }

  if (remoteRefs.length) {
    throw cliRefuse("remote-ref-refused", "Remote $ref is not resolved (no network, no file fetch)", {
      refs: remoteRefs.map((row) => ({
        pointer: row.pointer,
        before: beforeFpRefs(row.before),
        after: beforeFpRefs(row.after),
      })),
    });
  }

  return { impact, uncertainties };
}

function beforeFpRefs(fp) {
  if (!fp) return [];
  if (fp.refs) return fp.refs;
  if (fp.ref) return [fp.ref];
  if (fp.target) return beforeFpRefs(fp.target);
  return [];
}

function statusOf(impact, uncertainties) {
  if ((impact.unknown || []).length || (uncertainties || []).length) return "partial";
  if ((impact.breaking || []).length + (impact.deleted || []).length + (impact.added || []).length) {
    return "actionable";
  }
  return "informational";
}

export function runCompare({
  beforePath,
  afterPath,
  usedPath,
  exampleMode = false,
  outDir,
  provenance = "caller-input",
  hashAdapter = createHashTermsAdapter(),
}) {
  const beforeBuf = readTextFile(beforePath);
  const afterBuf = readTextFile(afterPath);
  const usedBuf = readTextFile(usedPath);
  const beforeDoc = parseJsonDocument(beforeBuf, "before");
  const afterDoc = parseJsonDocument(afterBuf, "after");
  const usedDoc = parseJsonDocument(usedBuf, "used");
  const usedSpec = parseUsedSpec(usedDoc);
  const kind = assertComparableKind(detectDocumentKind(beforeDoc), detectDocumentKind(afterDoc));
  const { impact, uncertainties } = compareDocuments({ beforeDoc, afterDoc, usedSpec, kind });
  const status = statusOf(impact, uncertainties);
  const sample = Boolean(exampleMode);
  const inputDigests = {
    before: digestMeta(beforePath, beforeBuf),
    after: digestMeta(afterPath, afterBuf),
    used: digestMeta(usedPath, usedBuf),
  };
  const body = buildTermsBody({
    kind,
    status,
    exampleMode,
    sample,
    impact: {
      breaking: impact.breaking.map(publicRow),
      added: impact.added.map(publicRow),
      deleted: impact.deleted.map(publicRow),
      unknown: impact.unknown.map(publicRow),
      unchangedCount: impact.unchanged.length,
      informationalCount: impact.informational.length,
      ignoredUnused: true,
    },
    inputDigests: {
      before: inputDigests.before.sha256,
      after: inputDigests.after.sha256,
      used: inputDigests.used.sha256,
      beforeBytes: inputDigests.before.bytes,
      afterBytes: inputDigests.after.bytes,
      usedBytes: inputDigests.used.bytes,
    },
    provenance: sample ? "fixture" : provenance,
  });
  const brief = attachTermsVersion(
    {
      ...body,
      ok: true,
      appId: "json-schema-webhook-drift",
      summary: summarize(impact, false),
      uncertainties,
      laterIntegrationBindings: [
        {
          id: "useful-jobs-catalog",
          status: "not-bound",
          note: "PR51 catalog is contrast only. Root owns catalog admission.",
        },
        {
          id: "i01-hash-terms",
          status: "pinned-hasher",
          note: "Neo PR54 hashTermsVersion contract. Earned-work kernel not imported.",
        },
      ],
      caller: {
        exampleMode: Boolean(exampleMode),
        sampleLabel: sample ? "SAMPLE" : "caller-input",
        notMarketFact: true,
        notCustomerDemand: true,
      },
    },
    hashAdapter,
  );

  const resolvedOut = resolveOutDir(outDir);
  fs.mkdirSync(resolvedOut, { recursive: true });
  const jsonPath = path.join(resolvedOut, OUTPUT_JSON);
  const mdPath = path.join(resolvedOut, OUTPUT_MD);
  fs.writeFileSync(jsonPath, `${JSON.stringify(brief, null, 2)}\n`);
  fs.writeFileSync(mdPath, toMarkdown(brief));
  return {
    ok: true,
    appId: brief.appId,
    status: brief.status,
    termsVersion: brief.termsVersion,
    kind: brief.kind,
    customerBrief: false,
    sample: brief.sample,
    exampleMode: Boolean(exampleMode),
    purchaseAuthority: false,
    sold: false,
    outDir: resolvedOut,
    outputs: [OUTPUT_JSON, OUTPUT_MD],
    breaking: brief.impact.breaking.length,
    unknown: brief.impact.unknown.length,
  };
}

function publicRow(row) {
  return {
    pointer: row.pointer,
    class: row.class,
    reason: row.reason,
    before: row.before,
    after: row.after,
  };
}

function resolveOutDir(outDir) {
  if (outDir) return path.resolve(String(outDir));
  return fs.mkdtempSync(path.join(os.tmpdir(), "webhook-drift-"));
}

export function runFromArgs(argv, { hashAdapter } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return { ok: true, help: true, exitCode: 0 };
  }
  const exampleMode = args.example === true || args.example === "true";
  let before = args.before;
  let after = args.after;
  let used = args.used;
  if (exampleMode) {
    const sample = examplePaths();
    before = sample.before;
    after = sample.after;
    used = sample.used;
  } else {
    const missing = ["before", "after", "used"].filter((key) => !args[key]);
    if (missing.length) {
      throw cliRefuse(
        "missing-required-inputs",
        "Caller mode requires --before, --after, --used; use --example for labeled SAMPLE fixtures",
        { missing },
      );
    }
  }
  return runCompare({
    beforePath: before,
    afterPath: after,
    usedPath: used,
    exampleMode,
    outDir: args["out-dir"],
    provenance: exampleMode ? "fixture" : "caller-input",
    hashAdapter: hashAdapter || createHashTermsAdapter(),
  });
}

export function emitRefuse(err) {
  const payload = {
    ok: false,
    refused: true,
    code: err.code || "error",
    error: err.message,
    detail: err.detail || null,
    customerBrief: false,
    sample: false,
    purchaseAuthority: false,
    sold: false,
    payment: { settling: false, prototype: true, paid: false },
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    notOpenApi: true,
    notApiUpgradeBrief: true,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return err.exitCode || 2;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = runFromArgs(argv);
    if (result.help) {
      process.exit(0);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  } catch (err) {
    if (err instanceof CliRefuse) {
      process.exit(emitRefuse(err));
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        refused: true,
        code: "internal-error",
        error: String(err?.message || err),
        customerBrief: false,
      })}\n`,
    );
    process.exit(1);
  }
}
