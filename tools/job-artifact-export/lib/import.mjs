import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { assertJobOutputCorrespondence, loadCatalog } from "./catalog.mjs";
import { completenessRecord } from "./d03-adapter.mjs";
import {
  FILE_MAX_BYTES,
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
  if (!options.out) throw refuse("missing-required-inputs", "import requires --out");
  const zipPath = resolve(options.zip);
  const outDir = resolve(options.out);
  if (!existsSync(zipPath)) throw refuse("missing-zip", "zip file is not at --zip");
  if (zipPath === outDir || outDir.startsWith(`${zipPath}/`)) {
    throw refuse("out-dir-collides-with-input", "--out collides with --zip");
  }

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
  if (manifest.customerDelivery === true || manifest.sold === true) {
    throw refuse("not-customer-delivery", "import refuses a customer-delivery or sold claim");
  }

  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  if (!listed.length) {
    throw refuse("job-output-mismatch", "manifest lists no job files", { jobId: manifest.jobId || null });
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
    if (row.bytes != null && Number(row.bytes) !== entry.data.length) {
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
  if (jsonl.length !== listed.length) {
    throw refuse("jsonl-manifest-mismatch", "files.jsonl rows do not match manifest.files");
  }
  for (const row of jsonl) {
    const man = listed.find((file) => file.path === row.path);
    if (!man || man.sha256 !== row.sha256) {
      throw refuse("jsonl-manifest-mismatch", "files.jsonl digest does not match manifest", { path: row.path });
    }
    if (row.jobId && row.jobId !== manifest.jobId) {
      throw refuse("job-output-mismatch", "jsonl jobId does not match manifest", {
        jobId: manifest.jobId,
        jsonlJobId: row.jobId,
      });
    }
  }

  const repoRoot = options.repoRoot;
  const catalog = loadCatalog(options.catalog || catalogPath(repoRoot));
  const jobEntries = parsed.entries.filter((entry) => !META_NAMES.has(entry.name));
  assertJobOutputCorrespondence({
    jobId: manifest.jobId,
    fileNames: listed.map((row) => posix.basename(row.path)),
    catalog,
    jsonAppId: firstJsonAppIdFromEntries(jobEntries),
  });

  const bound = bindArchiveIdentity({
    archiveFile: options.archiveFile || archivePath(repoRoot),
    claimedSha256: manifest.archiveSha256,
    expectedBareHex: USEFUL_JOBS_ARCHIVE_SHA256,
  });
  if (!bound.ok) throw refuse(bound.code, bound.message, { claimed: bound.claimed, actual: bound.actual });

  mkdirSync(outDir, { recursive: true });
  for (const entry of parsed.entries) {
    const dest = join(outDir, entry.name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.data);
  }

  const completeness = completenessRecord(
    typeof options.verifyComplete === "function"
      ? options.verifyComplete({ root: outDir, catalogPath: options.catalog || catalogPath(repoRoot) })
      : null,
  );

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
