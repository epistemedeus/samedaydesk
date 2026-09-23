import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { envelope, failError, nodeInfo, WANTED_NODE } from "./envelope.mjs";
import {
  fileBytes,
  hasClientDist,
  hasNodeModules,
  kitPath,
  readJson,
  sha256File,
  usefulJobsKitJson,
} from "./repo.mjs";
import { USEFUL_JOBS_NEGATIVE, USEFUL_JOBS_PIN } from "./catalog.mjs";

export function runDoctor({ root, dryRun = false } = {}) {
  const node = nodeInfo();
  const evidence = [];
  const pkg = readJson(join(root, "package.json"));
  const engines = pkg.engines?.node ?? null;
  const kitMeta = existsSync(usefulJobsKitJson(root)) ? readJson(usefulJobsKitJson(root)) : null;
  const kit = kitPath(root);
  const publicTwin = kitPath(root, { publicTwin: true });
  const negative = kitPath(root, { version: USEFUL_JOBS_NEGATIVE.version });
  const envExample = existsSync(join(root, ".env.example"));
  const envFile = existsSync(join(root, ".env"));

  evidence.push({ kind: "node", wanted: WANTED_NODE, actual: node.actual, major: node.major });
  evidence.push({ kind: "package", name: pkg.name, engines, start: pkg.scripts?.start || null });
  evidence.push({
    kind: "useful-jobs-kit",
    version: kitMeta?.version || null,
    sha256: kitMeta?.sha256 || null,
    bytes: kitMeta?.bytes || null,
    kitPresent: existsSync(kit),
    publicTwinPresent: existsSync(publicTwin),
  });
  evidence.push({
    kind: "negative-control",
    version: USEFUL_JOBS_NEGATIVE.version,
    present: existsSync(negative),
  });
  evidence.push({
    kind: "workspace",
    nodeModules: hasNodeModules(root),
    clientDist: hasClientDist(root),
    envExample,
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
      evidence: [...evidence, { kind: "argv", argv: ["node", "--version"] }],
    });
  }
  if (pkg.scripts?.start !== "node server/index.js") {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", 'package.json start must be "node server/index.js"'),
    });
  }
  if (!String(pkg.scripts?.build || "").includes("test:hosted-startup")) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "npm run build must include test:hosted-startup"),
    });
  }
  if (!kitMeta) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "client/src/data/usefulJobsKit.json missing"),
    });
  }
  if (kitMeta.version !== USEFUL_JOBS_PIN.version || kitMeta.sha256 !== USEFUL_JOBS_PIN.sha256 || kitMeta.bytes !== USEFUL_JOBS_PIN.bytes) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "usefulJobsKit.json does not match useful-jobs 1.4.7 pin", {
        expected: USEFUL_JOBS_PIN,
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
  evidence.push({ kind: "kit-hash", path: "client/public/kit/useful-jobs-1.4.7.tar.gz", sha256: digest, bytes });
  if (digest !== USEFUL_JOBS_PIN.sha256 || bytes !== USEFUL_JOBS_PIN.bytes) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "committed 1.4.7 kit hash/size mismatch"),
    });
  }
  const twinDigest = sha256File(publicTwin);
  if (twinDigest !== digest) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "kit and for-agents 1.4.7 archives are not twins"),
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
    version: "1.1.0",
    sha256: negativeDigest,
    bytes: negativeBytes,
  });
  if (negativeDigest !== USEFUL_JOBS_NEGATIVE.sha256 || negativeBytes !== USEFUL_JOBS_NEGATIVE.bytes) {
    return envelope({
      ok: false,
      command: "doctor",
      evidence,
      error: failError("HOST_BUILD", "1.1.0 negative-control pin mismatch"),
    });
  }
  if (envFile) {
    // Presence is reported; contents are never copied into evidence.
    const size = fileBytes(join(root, ".env"));
    evidence.push({ kind: "env-file", present: true, bytes: size, dumped: false });
  }

  return envelope({
    ok: true,
    command: "doctor",
    evidence,
    result: {
      node: node.actual,
      engines,
      kit: {
        version: USEFUL_JOBS_PIN.version,
        sha256: digest,
        bytes,
      },
      negativeControl: {
        version: USEFUL_JOBS_NEGATIVE.version,
        sha256: negativeDigest,
        bytes: negativeBytes,
      },
      start: "node server/index.js",
      nodeModules: hasNodeModules(root),
      clientDist: hasClientDist(root),
    },
  });
}
