import { existsSync, readFileSync, lstatSync } from "node:fs";
import { publishFiles, assertUnlinkedPath } from "./publication.mjs";
import { currentReceiptBinding, verifyCurrentComplete } from "./current-receipt.mjs";
import { createHashTermsAdapter } from "./hash-terms.mjs";
import { loadDeliveryCatalog } from "../../../server/paid-useful-jobs/lib/delivery-catalog.mjs";
import { inferProvenanceLabel } from "./labels.mjs";
import { dirname, join, posix, resolve } from "node:path";
import { assertJobOutputCorrespondence, loadCatalog } from "./catalog.mjs";
import { completenessRecord } from "./d03-adapter.mjs";
import {
  FILE_MAX_BYTES,
  TERMS_SCHEMA, JSONL_SCHEMA, SCHEMA_VERSION, loadKitPin,
  SCHEMA,
  USEFUL_JOBS_ARCHIVE_SHA256,
  archivePath,
  bindArchiveIdentity,
  catalogPath,
  prefixSha256,
  readZipSidecar,
  sha256Hex,
  sha256Prefixed,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { parseStoredZip } from "./zip.mjs";

const META_NAMES = new Set(["manifest.json", "files.jsonl"]);

function firstJsonAppIdFromEntries(entries) {
  for (const entry of entries) {
    if (!entry.name.endsWith(".json")) continue;
    try {
      const json = JSON.parse(entry.data.toString("utf8"));
      if (json && typeof json.appId === "string") return json.appId;
    } catch {
      continue;
    }
  }
  return null;
}

function parseJsonl(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split("\n").map((line) => JSON.parse(line));
}

export function importJobArtifacts(options) {
  if (!options.zip) throw refuse("missing-required-inputs", "import requires --zip");
  if (!options.out && !options.inspectOnly) throw refuse("missing-required-inputs", "import requires --out");
  const zipPath = resolve(options.zip);
  const outDir = options.out ? resolve(options.out) : null;
  if (!existsSync(zipPath)) throw refuse("missing-zip", "zip file is not at --zip");
  if (zipPath === outDir || outDir?.startsWith(`${zipPath}/`)) {
    throw refuse("out-dir-collides-with-input", "--out collides with --zip");
  }

  assertUnlinkedPath(zipPath);
  const stat = lstatSync(zipPath);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 64 * 1024 * 1024) throw refuse("invalid-zip", "Expected a bounded unlinked zip file");
  const zipBytes = readFileSync(zipPath);
  const zipSha256 = sha256Prefixed(zipBytes);
  const sidecar = readZipSidecar(zipPath);
  const claimed = options.zipSha256 ? prefixSha256(options.zipSha256) : sidecar;
  if (!claimed) {
    throw refuse(
      "missing-zip-digest-claim",
      "import requires --zip-sha256 or the sidecar written next to the zip by export",
    );
  }
  if (claimed !== zipSha256) {
    throw refuse("zip-bytes-mismatch", "consumed zip bytes are not the claimed archive", {
      claimed,
      actual: zipSha256,
    });
  }

  const parsed = parseStoredZip(zipBytes);
  const byName = new Map(parsed.entries.map((entry) => [entry.name, entry]));
  if (!byName.has("manifest.json") || !byName.has("files.jsonl")) {
    throw refuse("invalid-zip", "zip is missing manifest.json or files.jsonl");
  }

  let manifest;
  try {
    manifest = JSON.parse(byName.get("manifest.json").data.toString("utf8"));
  } catch {
    throw refuse("invalid-zip", "manifest.json is not JSON");
  }
  if (!manifest || manifest.schema !== SCHEMA) {
    throw refuse("invalid-zip", "manifest schema is not the export contract");
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.customerDelivery !== false || manifest.notSettling !== true || manifest.sold === true || !["SAMPLE", "sale"].includes(manifest.label)) {
    throw refuse("not-customer-delivery", "import refuses a customer-delivery or sold claim");
  }

  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  if (!listed.length) {
    throw refuse("job-output-mismatch", "manifest lists no job files", { jobId: manifest.jobId || null });
  }

  if (new Set(listed.map(row => row.path)).size !== listed.length || listed.some(row => META_NAMES.has(row.path))) {
    throw refuse("invalid-zip", "Duplicate or reserved manifest path");
  }
  const allowed = new Set(["manifest.json", "files.jsonl", ...listed.map((row) => row.path)]);
  for (const name of byName.keys()) {
    if (!allowed.has(name)) {
      throw refuse("zip-foreign-member", "zip contains a path not listed in the manifest", { path: name });
    }
  }

  for (const row of listed) {
    const entry = byName.get(row.path);
    if (!entry) {
      throw refuse("zip-member-missing", `zip lacks claimed path ${row.path}`, { path: row.path });
    }
    if (entry.data.length > FILE_MAX_BYTES) {
      throw refuse("file-over-size-cap", `file exceeds the 8MiB cap (${FILE_MAX_BYTES} bytes)`, {
        path: row.path,
        bytes: entry.data.length,
        cap: FILE_MAX_BYTES,
      });
    }
    const actualSha = prefixSha256(sha256Hex(entry.data));
    if (actualSha !== row.sha256) {
      throw refuse("zip-member-digest-mismatch", `zip member ${row.path} is not the manifest bytes`, {
        path: row.path,
        claimed: row.sha256,
        actual: actualSha,
      });
    }
    if (!Number.isSafeInteger(row.bytes) || row.bytes !== entry.data.length) {
      throw refuse("zip-member-size-mismatch", `zip member ${row.path} size does not match manifest`, {
        path: row.path,
      });
    }
  }

  let jsonl;
  try {
    jsonl = parseJsonl(byName.get("files.jsonl").data.toString("utf8"));
  } catch {
    throw refuse("invalid-zip", "files.jsonl is not JSONL");
  }
  if (jsonl.length !== listed.length || new Set(jsonl.map(row => row.path)).size !== jsonl.length) {
    throw refuse("jsonl-manifest-mismatch", "files.jsonl rows do not match manifest.files");
  }
  for (const row of jsonl) {
    const man = listed.find((file) => file.path === row.path);
    if (!man || man.sha256 !== row.sha256 || row.bytes !== man.bytes || row.schema !== JSONL_SCHEMA || row.label !== manifest.label || row.enginePin !== manifest.enginePin || row.mediaType !== man.mediaType || man.label !== manifest.label) {
      throw refuse("jsonl-manifest-mismatch", "files.jsonl digest does not match manifest", { path: row.path });
    }
    if (row.jobId !== manifest.jobId) {
      throw refuse("job-output-mismatch", "jsonl jobId does not match manifest", {
        jobId: manifest.jobId,
        jsonlJobId: row.jobId,
      });
    }
  }

  const repoRoot = options.repoRoot;
  const catalog = loadCatalog(options.catalog || loadDeliveryCatalog());
  const jobEntries = parsed.entries.filter((entry) => !META_NAMES.has(entry.name));
  assertJobOutputCorrespondence({
    jobId: manifest.jobId,
    fileNames: listed.map((row) => row.path),
    catalog,
    jsonAppId: firstJsonAppIdFromEntries(jobEntries),
  });

  const binding = currentReceiptBinding(jobEntries);
  if (JSON.stringify(binding?.execution || null) !== JSON.stringify(manifest.execution || null)) {
    throw refuse('execution-identity-mismatch', 'Manifest execution does not match receipt bytes');
  }
  const hasher = createHashTermsAdapter();
  const terms = { schema: TERMS_SCHEMA, schemaVersion: SCHEMA_VERSION, jobId: manifest.jobId,
    label: manifest.label, archiveSha256: manifest.archiveSha256, engine: manifest.engine,
    execution: binding?.execution || null,
    files: listed.map(row => ({ path: row.path, bytes: row.bytes, sha256: row.sha256 })) };
  const enginePin = hasher.hashTermsVersion({ schema: 'samedaydesk.job-artifact-export.engine-pin.v1',
    schemaVersion: SCHEMA_VERSION, ...manifest.engine });
  if (manifest.termsVersion !== hasher.hashTermsVersion(terms) || manifest.enginePin !== enginePin ||
      manifest.engine?.archiveSha256 !== manifest.archiveSha256) {
    throw refuse('terms-identity-mismatch', 'Immutable terms or engine identity do not match consumed bytes');
  }
  const signals = inferProvenanceLabel(jobEntries.map(e => {
    let json; try { json = JSON.parse(e.data); } catch {}
    return { path: e.name, text: e.data.toString('utf8'), json };
  }));
  if ((signals.label === 'SAMPLE' || binding?.receipt.sample) && manifest.label !== 'SAMPLE') {
    throw refuse('sample-not-sale', 'Bundle cannot relabel sample bytes');
  }
  const kit = loadKitPin(repoRoot);
  const bound = binding ? { ok: true, sha256: prefixSha256(binding.expected.sha256) } : bindArchiveIdentity({
    archiveFile: options.archiveFile || archivePath(repoRoot), claimedSha256: manifest.archiveSha256,
    expectedBareHex: kit.archiveSha256, expectedBytes: kit.bytes,
  });
  if (!bound.ok) throw refuse(bound.code, bound.message, { claimed: bound.claimed, actual: bound.actual });
  if (manifest.archiveSha256 !== bound.sha256) throw refuse('receipt-engine-mismatch', 'Manifest engine differs from current identity');
  if (options.inspectOnly) return { manifest, entries: parsed.entries, zipSha256, binding };
  const completeness = publishFiles(outDir, parsed.entries, stage => binding ? verifyCurrentComplete(stage, binding) : completenessRecord(
    typeof options.verifyComplete === 'function' ? options.verifyComplete({ root: stage, catalogPath: options.catalog || catalogPath(repoRoot) }) : null));

  return {
    ok: true,
    command: "import",
    jobId: manifest.jobId,
    label: manifest.label,
    customerDelivery: false,
    notSettling: true,
    archiveSha256: bound.sha256,
    zipSha256,
    jobOutputCorrespondence: true,
    files: listed.length,
    out: outDir,
    transport: "ok",
    analysisOutcome: manifest.label === "SAMPLE" ? "sample-or-fixture" : "sale-labelled-nonsettling",
    completeness,
  };
}
