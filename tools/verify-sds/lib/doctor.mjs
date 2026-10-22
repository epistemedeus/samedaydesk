import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOB_IDS,
  JOBS_SCHEMA,
  MCP,
  PACKS,
  START_SCRIPT,
  USEFUL_JOBS,
  USEFUL_JOBS_NEGATIVE,
  WANTED_NODE,
} from "./pins.mjs";
import { envelope, failError, nodeInfo } from "./envelope.mjs";
import { fileBytes, sha256File } from "./hash.mjs";
import { hasClientDist, hasNodeModules, packRoot, readJson, rel } from "./repo.mjs";

function jobsCatalog(root) {
  const path = join(packRoot(), "jobs.json");
  if (!existsSync(path)) return { ok: false, error: "jobs.json missing" };
  try {
    const doc = readJson(path);
    const ids = Array.isArray(doc.jobs) ? doc.jobs.map((job) => job.id) : [];
    const match =
      doc.schema === JOBS_SCHEMA &&
      ids.length === JOB_IDS.length &&
      JOB_IDS.every((id, i) => ids[i] === id);
    return { ok: match, path: "tools/verify-sds/jobs.json", ids, schema: doc.schema };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runDoctor(ctx) {
  const { root, dryRun = false } = ctx;
  const node = nodeInfo();
  const evidence = [];
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "package.json missing at repo root"),
    });
  }
  const pkg = readJson(pkgPath);
  const engines = pkg.engines?.node ?? null;
  const catalog = jobsCatalog(root);
  const skillPath = join(packRoot(), "SKILL.md");
  const kit = rel(root, USEFUL_JOBS.kitArchive);
  const publicTwin = rel(root, USEFUL_JOBS.publicArchive);
  const negative = rel(root, USEFUL_JOBS_NEGATIVE.kitArchive);
  const kitMetaPath = rel(root, USEFUL_JOBS.kitMeta);
  const envFile = existsSync(join(root, ".env"));

  evidence.push({ kind: "node", wanted: WANTED_NODE, actual: node.actual, major: node.major });
  evidence.push({
    kind: "package",
    name: pkg.name,
    engines,
    start: pkg.scripts?.start || null,
  });
  evidence.push({ kind: "jobs", ids: catalog.ids || [], ok: catalog.ok });
  evidence.push({
    kind: "skill",
    present: existsSync(skillPath),
    path: "tools/verify-sds/SKILL.md",
  });
  evidence.push({
    kind: "workspace",
    nodeModules: hasNodeModules(root),
    clientDist: hasClientDist(root),
    envFilePresent: envFile,
    envDumped: false,
  });

  if (pkg.name !== "samedaydesk") {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", `expected package name samedaydesk, got ${pkg.name}`),
    });
  }
  if (node.major !== 22) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("NODE_PIN", `Node ${WANTED_NODE} required, actual ${node.actual}`),
    });
  }
  if (engines !== WANTED_NODE) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("NODE_PIN", `root engines.node must be "${WANTED_NODE}"`),
    });
  }
  if (dryRun) {
    return envelope({
      ok: true,
      command: "doctor",
      dryRun: true,
      jobs: [...JOB_IDS],
      evidence: [...evidence, { kind: "argv", argv: ["node", "--version"] }],
      result: { would: ["check pins", "hash useful-jobs 1.4.7 kit", "confirm three jobs"] },
    });
  }
  if (pkg.scripts?.start !== START_SCRIPT) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", `package.json start must be "${START_SCRIPT}"`),
    });
  }
  if (!catalog.ok) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "tools/verify-sds/jobs.json must list useful-jobs, packs, mcp"),
    });
  }
  if (!existsSync(skillPath) || !readFileSync(skillPath, "utf8").includes("name: verify-sds")) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "tools/verify-sds/SKILL.md missing or unpinned"),
    });
  }
  if (!existsSync(kitMetaPath)) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "client/src/data/usefulJobsKit.json missing"),
    });
  }
  const kitMeta = readJson(kitMetaPath);
  if (
    kitMeta.version !== USEFUL_JOBS.version ||
    kitMeta.sha256 !== USEFUL_JOBS.sha256 ||
    kitMeta.bytes !== USEFUL_JOBS.bytes
  ) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "usefulJobsKit.json does not match useful-jobs 1.4.7 pin", {
        expected: { version: USEFUL_JOBS.version, sha256: USEFUL_JOBS.sha256, bytes: USEFUL_JOBS.bytes },
        actual: { version: kitMeta.version, sha256: kitMeta.sha256, bytes: kitMeta.bytes },
      }),
    });
  }
  if (!existsSync(kit) || !existsSync(publicTwin)) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "useful-jobs 1.4.7 kit/public archives missing"),
    });
  }
  const digest = sha256File(kit);
  const bytes = fileBytes(kit);
  evidence.push({
    kind: "kit-hash",
    path: USEFUL_JOBS.kitArchive,
    sha256: digest,
    bytes,
  });
  if (digest !== USEFUL_JOBS.sha256 || bytes !== USEFUL_JOBS.bytes) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("ARCHIVE", "committed 1.4.7 kit hash/size mismatch"),
    });
  }
  const twinDigest = sha256File(publicTwin);
  if (twinDigest !== digest) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("ARCHIVE", "kit and for-agents 1.4.7 archives are not twins"),
    });
  }
  if (!existsSync(negative)) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "useful-jobs 1.1.0 negative-control archive missing"),
    });
  }
  const negativeDigest = sha256File(negative);
  const negativeBytes = fileBytes(negative);
  evidence.push({
    kind: "negative-hash",
    version: USEFUL_JOBS_NEGATIVE.version,
    sha256: negativeDigest,
    bytes: negativeBytes,
  });
  if (
    negativeDigest !== USEFUL_JOBS_NEGATIVE.sha256 ||
    negativeBytes !== USEFUL_JOBS_NEGATIVE.bytes
  ) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("ARCHIVE", "1.1.0 negative-control pin mismatch"),
    });
  }
  if (negativeDigest === digest) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("ARCHIVE", "1.1.0 negative control must not match current 1.4.7 kit"),
    });
  }

  for (const pack of [PACKS.recordRepeat, PACKS.distributionRepair, PACKS.consumerRepeat]) {
    if (!existsSync(rel(root, pack.kitArchive)) || !existsSync(rel(root, pack.discovery))) {
      return envelope({
        ok: false,
        command: "doctor",
        evidence,
        error: failError("HOST_BUILD", `pack archive or discovery missing: ${pack.id}`),
      });
    }
  }
  if (!existsSync(rel(root, MCP.inventoryRel)) || !existsSync(rel(root, MCP.routeRel))) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("MCP", "shipped MCP inventory or route file missing"),
    });
  }
  if (envFile) {
    evidence.push({
      kind: "env-file",
      present: true,
      bytes: fileBytes(join(root, ".env")),
      dumped: false,
    });
  }

  return envelope({
    ok: true,
    command: "doctor",
    jobs: [...JOB_IDS],
    evidence,
    result: {
      node: node.actual,
      engines,
      jobs: [...JOB_IDS],
      kit: {
        version: USEFUL_JOBS.version,
        sha256: digest,
        bytes,
      },
      negativeControl: {
        version: USEFUL_JOBS_NEGATIVE.version,
        sha256: negativeDigest,
        bytes: negativeBytes,
      },
      start: START_SCRIPT,
      nodeModules: hasNodeModules(root),
      clientDist: hasClientDist(root),
    },
  });
}
