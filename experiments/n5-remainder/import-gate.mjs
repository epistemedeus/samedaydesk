#!/usr/bin/env node
// N5-REMAINDER import gate.
// consumer: synthetic-normal
// Importing this module does not exit and does not import a core.
// Running it with no source root still checks this branch, which is the
// default-main history, and exits 2 while the named cores are absent here.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const writerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const captureCommit = "da769f7870e494bb583e31766a477a2ff974fc10";
export const pinBlobs = {
  "tools/result-reuse/src/export.mjs": "939fa19abab4cf4432f8c8bc214cbb2676aca5f7",
  "tools/result-reuse/src/project.mjs": "bff16db7f645d27926836ccc2bb8deb4158a41c4",
  "tools/result-reuse/src/map.mjs": "8dd669b8d94142b17369567126e88a354d0c47ab",
  "tools/result-reuse/cli.mjs": "a8937ecb777cf017eeb5c327c06e553a3d0ffdf5",
  "vendor/hosted-wallet-market/src/voluntary-market.mjs": "e275901c9f436308ee697d7442fd3bccf6332793",
  "vendor/hosted-wallet-market/src/accepted-work-publication.mjs": "b5d8de857f7773edac86221337ad0f144eddb76d",
  "vendor/hosted-wallet-market/src/fee.mjs": "a20638869f7456b7be8e4237c6b57b691e85c98e",
};

export const checks = [
  {
    role: "capture-cli",
    path: "tools/result-reuse/src/export.mjs",
    exportName: "decideOrReuse",
  },
  {
    role: "capture-cli-project",
    path: "tools/result-reuse/src/project.mjs",
    exportName: "projectResult",
  },
  {
    role: "capture-cli-map",
    path: "tools/result-reuse/src/map.mjs",
    exportName: "n45RecordToObservation",
  },
  {
    role: "task-acceptance",
    path: "vendor/hosted-wallet-market/src/voluntary-market.mjs",
    exportName: "voluntaryMarket",
  },
  {
    role: "rights-check",
    path: "vendor/hosted-wallet-market/src/voluntary-market.mjs",
    exportName: "voluntaryMarket",
  },
  {
    role: "rights-publication",
    path: "vendor/hosted-wallet-market/src/accepted-work-publication.mjs",
    exportName: "proposalFrom",
  },
  {
    role: "fee",
    path: "vendor/hosted-wallet-market/src/fee.mjs",
    exportName: "quoteEconomics",
  },
];

function blob(root, relativePath) {
  const absolute = resolve(root, relativePath);
  if (!existsSync(absolute)) return null;
  return execFileSync("git", ["hash-object", absolute], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

async function inspect(root, check) {
  const absolute = resolve(root, check.path);
  const observedBlob = blob(root, check.path);
  const expectedBlob = pinBlobs[check.path] ?? null;
  const row = {
    role: check.role,
    path: check.path,
    exportName: check.exportName,
    filePresent: existsSync(absolute),
    exportPresent: false,
    blob: observedBlob,
    pinBlob: expectedBlob,
    pinBlobMatch: observedBlob !== null && observedBlob === expectedBlob,
    code: null,
    message: null,
  };
  if (!row.filePresent) {
    row.code = "ERR_MODULE_NOT_FOUND";
    row.message = `missing path ${check.path}`;
    return row;
  }
  try {
    const loaded = await import(pathToFileURL(absolute).href);
    row.exportPresent = typeof loaded[check.exportName] === "function";
    if (!row.exportPresent) {
      row.code = "MISSING_EXPORT";
      row.message = `export ${check.exportName} is absent`;
    } else if (!row.pinBlobMatch) {
      row.code = "PIN_BLOB_MISMATCH";
      row.message = `blob ${observedBlob} differs from pin blob ${expectedBlob}`;
    }
  } catch (error) {
    row.code = error.code || error.name || "IMPORT_FAILED";
    row.message = String(error.message || error).split("\n")[0];
  }
  return row;
}

export async function runImportGate(root = writerRoot) {
  const rows = [];
  for (const check of checks) rows.push(await inspect(root, check));
  const missing = rows.filter((row) => !row.filePresent || !row.exportPresent || !row.pinBlobMatch);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const stopped = missing.length > 0;
  return {
    consumer: "synthetic-normal",
    command: "experiments/n5-remainder/import-gate.mjs",
    head,
    captureCommit,
    stopped,
    delegationEmitted: 0,
    obligationCount: 0,
    feeLine: null,
    joinedRecord: null,
    missing: missing.map((row) => ({
      role: row.role,
      path: row.path,
      exportName: row.exportName,
      code: row.code,
      message: row.message,
      filePresent: row.filePresent,
      exportPresent: row.exportPresent,
      pinBlobMatch: row.pinBlobMatch,
    })),
    checks: rows,
  };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  const record = await runImportGate(writerRoot);
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  process.exit(record.stopped ? 2 : 0);
}
